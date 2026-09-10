#!/bin/sh
# 배포 — GitHub Actions 가 Artifact Registry 에 올린 이미지를 받아 띄운다 (README §5, §8, §11).
#
#   ./deploy/deploy.sh                    → 이 VM 의 이동 태그. 자동 배포(auto-deploy.sh)도 이것을 부른다
#   IMAGE_TAG=1a2b3c4 ./deploy/deploy.sh  → 특정 커밋(짧은 sha)의 이미지. 롤백도 이 형태다.
#                                           deploy/.pin 이 생겨 자동 배포가 멈춘다. 재개는 태그 없이 한 번 돌리기
#   SKIP_GIT_PULL=1 ./deploy/deploy.sh    → 저장소는 그대로 두고 이미지만
#
# 이 VM 이 무엇을 따라가는지는 체크아웃된 브랜치가 정한다(README §11):
#   main → 운영. 태그 latest, 알림 "[deploy]"        dev → 개발 서버. 태그 dev, 알림 "[deploy:dev]"
#
# 하는 일: 저장소를 origin 의 그 브랜치에 맞춤(compose·스크립트 갱신) → VM 서비스 계정 토큰으로 레지스트리 로그인
#          → pull → up -d → api 가 healthy 가 될 때까지 대기(최대 2분) → 운영자 채널에 한 줄.
#
# VM 서비스 계정에 Artifact Registry 리더 역할이 있어야 한다(README §5-2).
# 토큰은 1시간짜리라 매번 새로 받는다. gcloud 의 docker 자격 증명 도우미(docker-credential-gcloud)는
# snap 으로 깔린 gcloud 에서 PATH 에 없을 때가 있어 쓰지 않는다.
export PATH=/usr/local/bin:/usr/bin:/bin:/snap/bin
set -eu
cd "$(dirname "$0")/.."

REGISTRY=asia-northeast3-docker.pkg.dev
export IMAGE_REPO="${IMAGE_REPO:-asia-northeast3-docker.pkg.dev/ssanecting/ssafy-net}"
COMPOSE="docker compose -f deploy/docker-compose.prod.yml"

# 체크아웃된 브랜치 → 따라갈 이동 태그와 알림 머리말
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
if [ "$BRANCH" = "main" ]; then
  TRACK_TAG=latest
  LABEL=deploy
else
  TRACK_TAG=$BRANCH
  LABEL="deploy:$BRANCH"
fi
export IMAGE_TAG="${IMAGE_TAG:-$TRACK_TAG}"

if [ ! -f deploy/.env ]; then
  echo "[$LABEL] deploy/.env 가 없다. ./deploy/fetch-env.sh 를 먼저 돌린다" >&2
  exit 1
fi

# 운영자 채널에 한 줄. 웹훅의 기본 채널은 운영자 채널이라 발송 모드와 무관하게 거기로만 간다.
notify() {
  hook=$(grep -E '^MATTERMOST_WEBHOOK_URL=' deploy/.env | cut -d= -f2- | tr -d '\r' || true)
  [ -n "$hook" ] || return 0
  curl -s -m 5 -o /dev/null -X POST -H 'Content-Type: application/json' \
    --data "{\"text\": \"$1\"}" "$hook" || true
}

# 커밋을 고정하면 자동 배포가 멈춘다. 이동 태그로 돌리면 다시 켜진다.
if [ "$IMAGE_TAG" = "$TRACK_TAG" ]; then
  rm -f deploy/.pin
else
  echo "$IMAGE_TAG" > deploy/.pin
  echo "[$LABEL] $IMAGE_TAG 로 고정한다. 자동 배포는 멈춘다 — 재개는 ./deploy/deploy.sh ($TRACK_TAG) 또는 rm deploy/.pin"
fi

# VM 의 저장소는 읽기 전용 사본이다. pull 대신 origin 에 맞춘다 — 누가 VM 에서 파일을 만졌어도 배포가 서지 않고,
# dev 를 force-push 해도 따라온다. deploy/.env·.pin·backups 는 git 밖이라 그대로다.
if [ "${SKIP_GIT_PULL:-}" != "1" ]; then
  echo "[$LABEL] git: origin/$BRANCH 에 맞춘다"
  git fetch -q origin "$BRANCH"
  git reset -q --hard "origin/$BRANCH"
fi

# compose 가 deploy/backups 를 api 에 마운트한다. 없으면 Docker 가 root 소유로 만들어 backup.sh 가 못 쓴다.
mkdir -p deploy/backups

echo "[$LABEL] registry login ($REGISTRY)"
gcloud auth print-access-token \
  | docker login -u oauth2accesstoken --password-stdin "https://$REGISTRY" >/dev/null

echo "[$LABEL] pull IMAGE_TAG=$IMAGE_TAG"
$COMPOSE pull api web

echo "[$LABEL] up"
$COMPOSE up -d --remove-orphans

echo "[$LABEL] api 가 healthy 가 되기를 기다린다"
i=0
status=unknown
while [ "$i" -lt 24 ]; do
  cid=$($COMPOSE ps -q api 2>/dev/null || true)
  if [ -n "$cid" ]; then
    status=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo unknown)
  fi
  if [ "$status" = "healthy" ]; then
    # 이미지 라벨의 커밋(Actions 가 넣는다). 없으면 태그를 보여준다.
    rev=$(docker image inspect "$IMAGE_REPO/api:$IMAGE_TAG" \
      --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null | cut -c1-7 || true)
    echo "[$LABEL] $(date '+%F %T') 완료 — IMAGE_TAG=$IMAGE_TAG 커밋=${rev:-?}"
    $COMPOSE ps
    docker image prune -f >/dev/null
    notify "[$LABEL] 배포됨 — 커밋 ${rev:-$IMAGE_TAG} (api healthy)"
    exit 0
  fi
  i=$((i + 1))
  sleep 5
done

echo "[$LABEL] $(date '+%F %T') api 가 2분 안에 healthy 가 되지 않았다 (status=$status). 최근 로그:" >&2
$COMPOSE logs --tail=50 api >&2
notify "[$LABEL] 실패 — api 가 healthy 가 되지 않았다 (IMAGE_TAG=$IMAGE_TAG). VM 의 ~/deploy.log 를 본다"
exit 1
