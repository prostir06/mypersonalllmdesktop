#!/bin/sh
set -eu

quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

BACKUP_DIR=${BACKUP_DIR:-/backups}
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

{
  printf 'PGHOST=%s\n' "$(quote "${PGHOST:-postgres}")"
  printf 'PGPORT=%s\n' "$(quote "${PGPORT:-5432}")"
  printf 'PGUSER=%s\n' "$(quote "${PGUSER:-postgres}")"
  printf 'PGPASSWORD=%s\n' "$(quote "${PGPASSWORD:-}")"
  printf 'PGDATABASE=%s\n' "$(quote "${PGDATABASE:-llm_assistant}")"
  printf 'BACKUP_DIR=%s\n' "$(quote "$BACKUP_DIR")"
} > /etc/backup.env
chmod 600 /etc/backup.env

cat > /etc/cron.d/llm-backup <<'EOF'
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root . /etc/backup.env; /usr/local/bin/backup.sh dump >> /proc/1/fd/1 2>&1
EOF
chmod 0644 /etc/cron.d/llm-backup

exec cron -f
