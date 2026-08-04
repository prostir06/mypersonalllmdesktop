#!/bin/sh
set -e

echo "Waiting for database and applying Prisma migrations..."
npx prisma migrate deploy --config prisma/prisma.config.ts

echo "Starting backend..."
exec node -r ts-node/register src/server.js
