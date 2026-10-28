#!/usr/bin/env bash
# Daily encrypted MongoDB backup. Schedule with cron, e.g.:
#   15 3 * * * BACKUP_PASSPHRASE=... /path/to/Finanse/scripts/backup.sh
# Restore:
#   openssl enc -d -aes-256-cbc -pbkdf2 -in finanse-YYYY-MM-DD.archive.gz.enc | mongorestore --archive --gzip --uri "$MONGO_URI"
set -euo pipefail

MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/finanse}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/finanse-backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"

mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/finanse-$(date +%F).archive.gz.enc"

mongodump --uri "$MONGO_URI" --archive --gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$file"

find "$BACKUP_DIR" -name 'finanse-*.archive.gz.enc' -mtime +"$KEEP_DAYS" -delete
echo "Backup written to $file"
