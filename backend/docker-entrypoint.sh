#!/bin/sh
set -e

# Fail closed in production: no placeholder secrets, no ts-node fallback.
if [ "${NODE_ENV}" = "production" ]; then
  case "${JWT_SECRET}" in
    ""|"change_this_secret_in_production")
      echo "FATAL: JWT_SECRET must be set to a strong non-default value in production" >&2
      exit 1
      ;;
  esac
  case "${DB_PASSWORD}" in
    ""|"password")
      echo "FATAL: DB_PASSWORD must be set to a strong non-default value in production" >&2
      exit 1
      ;;
  esac
  case "${ENCRYPTION_KEY}" in
    "")
      echo "FATAL: ENCRYPTION_KEY must be set in production (32-byte base64 or 64 hex chars)" >&2
      exit 1
      ;;
  esac
  if [ ! -f dist/server.js ]; then
    echo "FATAL: dist/server.js missing; production refuses ts-node bind-mount fallback" >&2
    exit 1
  fi
fi

# Named volumes / bind mounts may be root-owned; ensure appuser can write uploads+logs.
mkdir -p /app/logs /app/uploads/chat-temp
if [ "$(id -u)" = "0" ]; then
  chown -R appuser:appgroup /app/logs /app/uploads || true
fi

run_as_app() {
  if [ "$(id -u)" = "0" ] && command -v su-exec >/dev/null 2>&1; then
    exec su-exec appuser "$@"
  fi
  exec "$@"
}

echo "Waiting for database and applying Prisma migrations..."
npx prisma migrate deploy --config prisma/prisma.config.ts
npx prisma generate --config prisma/prisma.config.ts

if [ "${NODE_ENV}" != "production" ] && [ -d src ] && [ -f dist/server.js ]; then
  if find src -name '*.ts' -type f -newer dist/server.js | grep -q .; then
    echo "WARNING: src is newer than dist/server.js; rebuilding backend..."
    if ! npm run build; then
      echo "FATAL: backend rebuild failed; refusing to start stale dist/server.js" >&2
      exit 1
    fi
  fi
fi

if [ -f dist/server.js ]; then
  echo "Starting backend from dist/..."
  run_as_app node dist/server.js
fi

echo "Starting backend via ts-node (dev bind-mount fallback)..."
run_as_app node -r ts-node/register src/server.ts
