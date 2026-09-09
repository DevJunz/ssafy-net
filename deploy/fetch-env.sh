#!/bin/sh
# Secret Manager 의 보안 비밀(기본 ssafy-net-env) 최신 버전을 deploy/.env 로 내려받는다.
#
#   준비:  README §5-1. 보안 비밀 ssafy-net-env 에 .env 내용 통째로. VM 서비스 계정에
#          "Secret Manager 보안 비밀 접근자" 역할, VM 의 Cloud API 액세스 범위는 "모든 Cloud API".
#   실행:  ./deploy/fetch-env.sh            → deploy/.env 갱신
#          ./deploy/fetch-env.sh other-name → 다른 이름의 보안 비밀을 쓸 때
#   갱신:  콘솔에서 새 버전을 올린 뒤 이 스크립트를 다시 돌리고
#          docker compose -f deploy/docker-compose.prod.yml up -d api
#
# 값의 원본은 Secret Manager 다. VM 의 deploy/.env 는 내려받은 사본이며 언제든 다시 만들 수 있다.
set -eu
cd "$(dirname "$0")"

secret="${1:-ssafy-net-env}"

gcloud secrets versions access latest --secret="$secret" > .env.tmp
if ! grep -q '^SITE_ADDRESS=' .env.tmp; then
  rm -f .env.tmp
  echo "[fetch-env] $secret 의 내용에 SITE_ADDRESS 가 없다. .env 형식이 맞는지 콘솔에서 확인한다" >&2
  exit 1
fi
chmod 600 .env.tmp
mv .env.tmp .env
echo "[fetch-env] deploy/.env ← $secret ($(grep -c '=' .env) 항목)"
