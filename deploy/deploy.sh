#!/bin/sh
# 배포 — GitHub Actions 가 Artifact Registry 에 올린 이미지를 받아 띄운다 (README §5, §8).
#
#   ./deploy/deploy.sh                    → latest. 자동 배포(auto-deploy.sh)도 이것을 부른다
#   IMAGE_TAG=1a2b3c4 ./deploy/deploy.sh  → 특정 커밋(짧은 sha)의 이미지. 롤백도 이 형태다.
#                                           deploy/.pin 이 생겨 자동 배포가 멈춘다. 재개는 latest 로 한 번 돌리기
#   SKIP_GIT_PULL=1 ./deploy/deploy.sh    → 저장소는 그대로 두고 이미지만
#
# 하는 일: git pull(compose·스크립트 갱신) → VM 서비스 계정 토큰으로 레지스트리 로그인
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
export IMAGE_TAG="${IMAGE_TAG:-latest}"

if [ ! -f deploy/.env ]; then
  echo "[deploy] deploy/.env 가 없다. ./deploy/fetch-env.sh 를 먼저 돌린다" >&2
  exit 1
fi

# 운영자 채널에 한 줄. 웹훅의 기본 채널은 운영자 채널이라 발송 모드와 무관하게 거기로만 간다.
notify() {
  hook=$(grep -E '^MATTERMOST_WEBHOOK_URL=' deploy/.env | cut -d= -f2- | tr -d '\r' || true)
  [ -n "$hook" ] || return 0
  curl -s -m 5 -o /dev/null -X POST -H 'Content-Type: application/json' \
    --data "{\"text\": \"$1\"}" "$hook" || true
}

# 커밋을 고정하면 자동 배포가 멈춘다. latest 로 돌리면 다시 켜진다.
if [ "$IMAGE_TAG" = "latest" ]; then
  rm -f deploy/.pin
else
  echo "$IMAGE_TAG" > deploy/.pin
  echo "[deploy] $IMAGE_TAG 로 고정한다. 자동 배포는 멈춘다 — 재개는 ./deploy/deploy.sh (latest) 또는 rm deploy/.pin"
fi

if [ "${SKIP_GIT_PULL:-}" != "1" ]; then
  echo "[deploy] git pull"
  git pull --ff-only
fi

# compose 가 deploy/backups 를 api 에 마운트한다. 없으면 Docker 가 root 소유로 만들어 backup.sh 가 못 쓴다.
mkdir -p deploy/backups

echo "[deploy] registry login ($REGISTRY)"
gcloud auth print-access-token \
  | docker login -u oauth2accesstoken --password-stdin "https://$REGISTRY" >/dev/null

echo "[deploy] pull IMAGE_TAG=$IMAGE_TAG"
$COMPOSE pull api web

echo "[deploy] up"
$COMPOSE up -d --remove-orphans

echo "[deploy] api 가 healthy 가 되기를 기다린다"
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
    echo "[deploy] $(date '+%F %T') 완료 — IMAGE_TAG=$IMAGE_TAG 커밋=${rev:-?}"
    $COMPOSE ps
    docker image prune -f >/dev/null
    notify "[deploy] 배포됨 — 커밋 ${rev:-$IMAGE_TAG} (api healthy)"
    exit 0
  fi
  i=$((i + 1))
  sleep 5
done

echo "[deploy] $(date '+%F %T') api 가 2분 안에 healthy 가 되지 않았다 (status=$status). 최근 로그:" >&2
$COMPOSE logs --tail=50 api >&2
notify "[deploy] 실패 — api 가 healthy 가 되지 않았다 (IMAGE_TAG=$IMAGE_TAG). VM 의 ~/deploy.log 를 본다"
exit 1
