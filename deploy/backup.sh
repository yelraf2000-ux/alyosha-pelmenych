#!/bin/sh
# Backs up the shop into $BACKUP_DIR (default /backups):
#   db-<date>.dump          the whole database, in pg_dump's custom format (restore with pg_restore)
#   uploads-<date>.tar.gz   the uploaded product photos
# and deletes backups older than $KEEP_DAYS days (default 14).
#
#   backup.sh            one backup, now
#   backup.sh --daily    stay running and make one backup every day at 23:00 UTC (03:00 in Yerevan)
#
# The database is found through the standard PGHOST / PGUSER / PGDATABASE / PGPASSWORD variables.

set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DAILY_AT_UTC_HOUR=23

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
}

run_backup() {
  stamp="$(date -u +%Y-%m-%d_%H%M)"
  mkdir -p "$BACKUP_DIR"

  # Written under a temporary name first: a file with the final name is always a complete backup.
  pg_dump --format=custom --file="$BACKUP_DIR/db-$stamp.dump.part"
  mv "$BACKUP_DIR/db-$stamp.dump.part" "$BACKUP_DIR/db-$stamp.dump"

  if [ -d "$UPLOADS_DIR" ]; then
    tar -czf "$BACKUP_DIR/uploads-$stamp.tar.gz.part" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
    mv "$BACKUP_DIR/uploads-$stamp.tar.gz.part" "$BACKUP_DIR/uploads-$stamp.tar.gz"
  fi

  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime "+$KEEP_DAYS" -exec rm -f {} +
  log "backup done: db-$stamp.dump ($(wc -c < "$BACKUP_DIR/db-$stamp.dump") bytes)"
}

seconds_until_next_run() {
  now="$(date -u +%s)"
  next=$(( now - now % 86400 + DAILY_AT_UTC_HOUR * 3600 ))
  if [ "$next" -le "$now" ]; then
    next=$(( next + 86400 ))
  fi
  echo $(( next - now ))
}

if [ "${1:-}" = "--daily" ]; then
  log "backups run daily at ${DAILY_AT_UTC_HOUR}:00 UTC; keeping $KEEP_DAYS days in $BACKUP_DIR"
  while true; do
    sleep "$(seconds_until_next_run)"
    # A failed night (database restarting, disk full) is logged; the next night is tried again.
    run_backup || log "BACKUP FAILED"
  done
else
  run_backup
fi
