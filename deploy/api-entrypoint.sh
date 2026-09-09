#!/bin/sh
# api 컨테이너 시작 절차: 마이그레이션을 적용한 뒤 서버를 띄운다.
#
# prisma migrate deploy 는 멱등이라 매 시작마다 돌려도 된다.
# migrate dev 는 비대화형에서 막히므로 쓰지 않는다(CLAUDE.md "함정").
set -eu

echo "[entrypoint] prisma migrate deploy"
npx prisma migrate deploy --schema prisma/schema.prisma

echo "[entrypoint] start: $*"
exec "$@"
