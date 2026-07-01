#!/bin/bash
# Ежедневный бэкап rolgi_v6 с ротацией (хранится 7 последних)
set -e
BACKUP_DIR="/srv/projects/rolgi/backups"
TS=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/rolgi_v6_$TS.sql.gz"
docker exec rolgi-postgres pg_dump -U postgres -d rolgi_v6 | gzip > "$OUT"
echo "$(date -Iseconds) backup OK: $OUT ($(du -h "$OUT" | cut -f1))"
# Ротация: оставляем 7 последних
ls -t "$BACKUP_DIR"/rolgi_v6_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
