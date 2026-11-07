#!/bin/sh
# Retention only. Does not need Postgres.
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

daily="$tmp/daily"
weekly="$tmp/weekly"
mkdir -p "$daily" "$weekly"

i=1
while [ "$i" -le 9 ]; do
  printf 'd' > "$daily/llm-2026110$i.dump"
  i=$((i + 1))
done
i=1
while [ "$i" -le 6 ]; do
  printf 'w' > "$weekly/llm-2026100$i.dump"
  i=$((i + 1))
done

BACKUP_DIR="$tmp" "$root/backup.sh" prune

daily_count=$(find "$daily" -maxdepth 1 -type f -name 'llm-*.dump' | wc -l | tr -d ' ')
weekly_count=$(find "$weekly" -maxdepth 1 -type f -name 'llm-*.dump' | wc -l | tr -d ' ')
test "$daily_count" = "7"
test "$weekly_count" = "4"
test ! -e "$daily/llm-20261101.dump"
test ! -e "$daily/llm-20261102.dump"
test -e "$daily/llm-20261109.dump"
test ! -e "$weekly/llm-20261001.dump"
test ! -e "$weekly/llm-20261002.dump"
test -e "$weekly/llm-20261006.dump"
echo "backup retention ok"
