FROM pgvector/pgvector:0.8.7-pg15

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/backup-entrypoint.sh
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/backup-entrypoint.sh

ENV BACKUP_DIR=/backups \
    PGHOST=postgres \
    PGPORT=5432

ENTRYPOINT ["/usr/local/bin/backup-entrypoint.sh"]
