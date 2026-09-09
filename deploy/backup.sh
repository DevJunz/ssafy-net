#!/bin/sh
# 하루 1회 pg_dump (design/20 §13 · design/23 §8).
#
#   설치:  crontab -e  →  0 4 * * * /home/<user>/ssafy-net/deploy/backup.sh >> /home/<user>/backup.log 2>&1
#   보관:  deploy/backups/ 에 14일. deploy/.env 의 BACKUP_BUCKET 이 있으면 gs://<bucket>/ 에도 올린다
#          (VM 서비스 계정에 Storage 객체 생성 권한이 있어야 한다).
#   복원:  gunzip -c deploy/backups/ssafynet-<stamp>.sql.gz \
#            | docker compose -f deploy/docker-compose.prod.yml exec -T db psql -U ssafynet -d ssafynet
#          복원은 공개 전에 한 번 실제로 해 본다.
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
