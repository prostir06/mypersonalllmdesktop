#!/bin/sh
# pg_dump sidecar: daily file plus Sunday weekly copy.
#   backup.sh dump
#   backup.sh prune
#   backup.sh restore /backups/daily/llm-YYYYMMDD.dump
set -eu

if [ -f /etc/backup.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/backup.env
  set +a
fi

cmd=${1:-dump}
BACKUP_DIR=${BACKUP_DIR:-/backups}
DAILY="$BACKUP_DIR/daily"
WEEKLY="$BACKUP_DIR/weekly"

prune_keep() {
  dir=$1
  keep=$2
  mkdir -p "$dir"
  files=$(find "$dir" -maxdepth 1 -type f -name 'llm-*.dump' | sort)
  if [ -z "$files" ]; then
    return 0
  fi
  total=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
  drop=$((total - keep))
  if [ "$drop" -le 0 ]; then
    return 0
  fi
  printf '%s\n' "$files" | head -n "$drop" | while IFS= read -r old; do
    rm -f "$old"
  done
}

case "$cmd" in
  prune)
    prune_keep "$DAILY" 7
    prune_keep "$WEEKLY" 4
    ;;
  dump)
    mkdir -p "$DAILY" "$WEEKLY"
    stamp=$(date -u +%Y%m%d)
    tmp="$DAILY/llm-$stamp.dump.tmp"
    final="$DAILY/llm-$stamp.dump"
    pg_dump -Fc --no-owner --file "$tmp"
    mv "$tmp" "$final"
    dow=$(date -u +%u)
    if [ "$dow" = "7" ] || [ "${BACKUP_FORCE_WEEKLY:-}" = "1" ]; then
      cp "$final" "$WEEKLY/llm-$stamp.dump"
    fi
    prune_keep "$DAILY" 7
    prune_keep "$WEEKLY" 4
    echo "backup written: $final"
    ;;
  restore)
    file=${2:-}
    if [ -z "$file" ] || [ ! -f "$file" ]; then
      echo "usage: backup.sh restore /backups/daily/llm-YYYYMMDD.dump" >&2
      exit 1
    fi
    pg_restore --clean --if-exists --no-owner --dbname "${PGDATABASE:?PGDATABASE is required}" "$file"
    ;;
  *)
    echo "usage: backup.sh dump|prune|restore <file>" >&2
    exit 1
    ;;
esac
