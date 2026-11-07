# Backup and restore

The Compose stack runs a `backup` sidecar next to Postgres. Once a day at 03:15 UTC it writes a custom-format `pg_dump` and keeps **7 daily** files plus **4 weekly** copies (the Sunday dump). Files live in the `backup_data` volume:

- `/backups/daily/llm-YYYYMMDD.dump`
- `/backups/weekly/llm-YYYYMMDD.dump`

A second dump on the same UTC date overwrites that day's file. Client and server are both `pgvector/pgvector:0.8.7-pg15`.

## Backup before an upgrade

Run this before `docker compose ... up -d --build` when the upgrade includes migrations or an image change:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backup /usr/local/bin/backup.sh dump
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backup ls -l /backups/daily
```

Confirm today's `llm-YYYYMMDD.dump` is present, then upgrade. The same `dump` command works against the dev compose file.

## Restore

Stop the API first so nothing writes during the restore. `pg_restore --clean` drops and recreates objects in the target database. `pg_restore` can exit 1 on harmless warnings; check that the tables are back before starting the API.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backup \
  /usr/local/bin/backup.sh restore /backups/daily/llm-YYYYMMDD.dump
docker compose -f docker-compose.yml -f docker-compose.prod.yml start backend
```

Use a file under `/backups/weekly/` when the daily set no longer has the day you need.

Retention (7 daily, 4 weekly, oldest names deleted) is checked by `deploy/backup/backup.test.sh`. The dump and restore commands above were run against a throwaway `pgvector/pgvector:0.8.7-pg15` container: a probe row survived `pg_dump` / `pg_restore --clean --if-exists`.
