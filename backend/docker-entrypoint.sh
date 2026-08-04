#!/bin/sh
set -e

echo "Waiting for database and applying Prisma migrations..."
npx prisma migrate deploy --config prisma/prisma.config.ts

if [ -f dist/server.js ]; then
  echo "Starting backend from dist/..."
  exec node dist/server.js
fi

echo "Starting backend via ts-node (dev bind-mount fallback)..."
exec node -r ts-node/register src/server.js
