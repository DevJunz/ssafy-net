#!/bin/sh
# 자동 배포 — VM 의 cron 이 2분마다 부른다 (README §8).
#
# 레지스트리의 api:latest 지문(digest)이 지금 받아 둔 것과 다르면 deploy.sh 를 돌린다.
# main 에 푸시 → Actions 초록불 → 2분 안에 VM 에 올라간다. 밖에서 VM 으로 들어오는 길(SSH 키)을 열지 않는다 —
# VM 이 스스로 당겨온다. 인증은 VM 서비스 계정(Artifact Registry 리더)뿐이다.
#
#   설치:  ( crontab -l 2>/dev/null; echo "*/2 * * * * $HOME/ssafy-net/deploy/auto-deploy.sh >> $HOME/deploy.log 2>&1" ) | crontab -
#   멈춤:  deploy/.pin 이 있으면 아무것도 하지 않는다. IMAGE_TAG 를 지정해 deploy.sh 를 돌리면(롤백) 생긴다.
#   재개:  ./deploy/deploy.sh (latest) 또는 rm deploy/.pin
#
# cron 의 PATH 에는 /snap/bin(gcloud)이 없어 여기서 직접 잡는다.
export PATH=/usr/local/bin:/usr/bin:/bin:/snap/bin
set -eu
cd "$(dirname "$0")/.."

IMAGE="${IMAGE_REPO:-asia-northeast3-docker.pkg.dev/ssanecting/ssafy-net}/api"

if [ -f deploy/.pin ]; then
  exit 0
fi

remote=$(gcloud artifacts docker images describe "$IMAGE:latest" \
  --format='value(image_summary.digest)' 2>/dev/null || true)
if [ -z "$remote" ]; then
  echo "[auto-deploy] $(date '+%F %T') 레지스트리 조회 실패 — VM 서비스 계정의 Artifact Registry 리더 역할과 gcloud 를 본다"
  exit 1
fi

current=$(docker image inspect "$IMAGE:latest" \
  --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null | sed -n 's/.*@//p' | head -1 || true)

if [ "$remote" = "$current" ]; then
  exit 0
fi

echo "[auto-deploy] $(date '+%F %T') 새 이미지 ${remote#sha256:} (지금 ${current#sha256:})"
# 겹쳐 돌지 않게 잠근다. 앞 배포가 아직이면 이번 회차는 건너뛴다.
exec flock -n /tmp/ssafy-net-deploy.lock ./deploy/deploy.sh
