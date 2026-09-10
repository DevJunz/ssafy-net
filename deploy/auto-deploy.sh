#!/bin/sh
# 자동 배포 — VM 의 cron 이 2분마다 부른다 (README §8, §11).
#
# 이 VM 이 따라가는 이동 태그(main 이면 latest, dev 면 dev)의 레지스트리 지문(digest)이
# 지금 받아 둔 것과 다르면 deploy.sh 를 돌린다. api·web 둘 다 본다(하나라도 다르면 배포).
# 브랜치에 푸시 → Actions 초록불 → 2분 안에 그 브랜치의 VM 에 올라간다. 밖에서 VM 으로 들어오는 길(SSH 키)을 열지 않는다 —
# VM 이 스스로 당겨온다. 인증은 VM 서비스 계정(Artifact Registry 리더)뿐이다.
#
#   설치:  ( crontab -l 2>/dev/null; echo "*/2 * * * * $HOME/ssafy-net/deploy/auto-deploy.sh >> $HOME/deploy.log 2>&1" ) | crontab -
#   멈춤:  deploy/.pin 이 있으면 아무것도 하지 않는다. IMAGE_TAG 를 지정해 deploy.sh 를 돌리면(롤백) 생긴다.
#   재개:  ./deploy/deploy.sh (이동 태그) 또는 rm deploy/.pin
#
# cron 의 PATH 에는 /snap/bin(gcloud)이 없어 여기서 직접 잡는다.
export PATH=/usr/local/bin:/usr/bin:/bin:/snap/bin
set -eu
cd "$(dirname "$0")/.."

REPO="${IMAGE_REPO:-asia-northeast3-docker.pkg.dev/ssanecting/ssafy-net}"

# 체크아웃된 브랜치 → 따라갈 이동 태그 (deploy.sh 와 같은 규칙)
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
if [ "$BRANCH" = "main" ]; then TRACK_TAG=latest; else TRACK_TAG=$BRANCH; fi

if [ -f deploy/.pin ]; then
  exit 0
fi

# api 와 web 을 둘 다 본다. 하나만 보면 한쪽만 새것인 채로 굳는다 —
# 2026-09-10 개발 서버가 그랬다. api 만 감시하는데 Actions 가 api 를 먼저 올리고 web 을 나중에 올려,
# 그 사이에 cron 이 끼자 새 api + 옛 web 으로 뜬 뒤 지문이 같아져 다시 돌지 않았다.
# 워크플로도 두 이미지를 다 만든 뒤에 이동 태그를 붙이도록 바꿨지만(build.yml), 여기서도 확인한다.
changed=""
for name in api web; do
  remote=$(gcloud artifacts docker images describe "$REPO/$name:$TRACK_TAG" \
    --format='value(image_summary.digest)' 2>/dev/null || true)
  if [ -z "$remote" ]; then
    echo "[auto-deploy] $(date '+%F %T') 레지스트리 조회 실패 ($REPO/$name:$TRACK_TAG) — 태그가 있는지(그 브랜치로 Actions 가 한 번은 돌았는지), VM 서비스 계정의 Artifact Registry 리더 역할과 gcloud 를 본다"
    exit 1
  fi

  current=$(docker image inspect "$REPO/$name:$TRACK_TAG" \
    --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null | sed -n 's/.*@//p' | head -1 || true)

  if [ "$remote" != "$current" ]; then
    changed="$changed $name(${remote#sha256:})"
  fi
done

if [ -z "$changed" ]; then
  exit 0
fi

echo "[auto-deploy] $(date '+%F %T') $TRACK_TAG 새 이미지 —$changed"
# 겹쳐 돌지 않게 잠근다. 앞 배포가 아직이면 이번 회차는 건너뛴다.
exec flock -n /tmp/ssafy-net-deploy.lock ./deploy/deploy.sh
