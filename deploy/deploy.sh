#!/bin/sh
# 배포 — GitHub Actions 가 Artifact Registry 에 올린 이미지를 받아 띄운다 (README §5, §8).
#
#   ./deploy/deploy.sh                    → latest
#   IMAGE_TAG=1a2b3c4 ./deploy/deploy.sh  → 특정 커밋(짧은 sha)의 이미지. 롤백도 이 형태다
#   SKIP_GIT_PULL=1 ./deploy/deploy.sh    → 저장소는 그대로 두고 이미지만
#
# 하는 일: git pull(compose·스크립트 갱신) → VM 서비스 계정 토큰으로 레지스트리 로그인
#          → pull → up -d → api 가 healthy 가 될 때까지 대기(최대 2분).
#
# VM 서비스 계정에 Artifact Registry 리더 역할이 있어야 한다(README §5-2).
# 토큰은 1시간짜리라 매번 새로 받는다. gcloud 의 docker 자격 증명 도우미(docker-credential-gcloud)는
# snap 으로 깔린 gcloud 에서 PATH 에 없을 때가 있어 쓰지 않는다.
set -eu
cd "$(dirname "$0")/.."

REGISTRY=asia-northeast3-docker.pkg.dev
COMPOSE="docker compose -f deploy/docker-compose.prod.yml"
export IMAGE_TAG="${IMAGE_TAG:-latest}"

if [ ! -f deploy/.env ]; then
  echo "[deploy] deploy/.env 가 없다. ./deploy/fetch-env.sh 를 먼저 돌린다" >&2
  exit 1
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
    echo "[deploy] 완료 — IMAGE_TAG=$IMAGE_TAG"
    $COMPOSE ps
    docker image prune -f >/dev/null
    exit 0
  fi
  i=$((i + 1))
  sleep 5
done

echo "[deploy] api 가 2분 안에 healthy 가 되지 않았다 (status=$status). 최근 로그:" >&2
$COMPOSE logs --tail=50 api >&2
exit 1
