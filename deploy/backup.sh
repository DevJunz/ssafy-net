#!/bin/sh
# 하루 1회 pg_dump (design/20 §13 · design/23 §8).
#
#   설치:  README §7 — crontab 에 PATH 줄(/snap/bin 의 gcloud)과 `0 4 * * * ~/ssafy-net/deploy/backup.sh` 를 넣는다.
#   보관:  deploy/backups/ 에 14일. deploy/.env 의 BACKUP_BUCKET 이 있으면 gs://<bucket>/ 에도 올린다
#          (VM 서비스 계정에 Storage 객체 생성 권한이 있어야 한다).
#   복원:  README §7. 리허설은 운영 DB 가 아니라 빈 DB(ssafynet_restore)에 풀어 본다 — 운영 DB 에 그대로 풀면
#          표가 이미 있어 실패하거나 행이 겹친다. 실제 복원은 api 를 멈추고 DB 를 비운 뒤 푼다.
set -eu
cd "$(dirname "$0")"
mkdir -p backups

stamp=$(date +%Y%m%d-%H%M)
file="backups/ssafynet-$stamp.sql.gz"

docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U ssafynet -d ssafynet --no-owner | gzip > "$file"
echo "[backup] $file ($(du -h "$file" | cut -f1))"

find backups -name 'ssafynet-*.sql.gz' -mtime +14 -delete

bucket=$(grep -E '^BACKUP_BUCKET=' .env 2>/dev/null | cut -d= -f2- || true)
if [ -n "$bucket" ]; then
  gcloud storage cp "$file" "gs://$bucket/" && echo "[backup] uploaded to gs://$bucket/"
fi
