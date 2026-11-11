# ============================================================
# Multi-stage Dockerfile for BACKEND
# deps installs the full tree.
# build generates Prisma Client and compiles TypeScript (dev image target: keeps devDependencies).
# production installs runtime deps only and copies dist/.
# ============================================================

# --- Stage 1: Dependencies + Prisma Client ---
FROM node:24-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

COPY package*.json ./
RUN npm ci

# --- Stage 2: Compile (also the dev compose target) ---
FROM node:24-alpine AS build

WORKDIR /app

RUN apk add --no-cache openssl su-exec

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# generate після COPY src: output лежить у src/generated і інакше затреться
ENV DATABASE_URL="postgresql://postgres:password@localhost:5432/llm_assistant"
RUN chmod +x /app/docker-entrypoint.sh \
  && npx prisma generate --config prisma/prisma.config.ts \
  && npm run build \
  && mkdir -p /app/logs /app/uploads/chat-temp \
  && addgroup -S appgroup && adduser -S appuser -G appgroup \
  && chown -R appuser:appgroup /app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/api/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]

# --- Stage 3: Production runtime without devDependencies ---
FROM node:24-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl su-exec

COPY package*.json ./
# Node 24.22 bundles npm 11.19.1 (brace-expansion 5.0.9, undici 6.28.0).
# prisma CLI stays available for `migrate deploy`; it is not a runtime library.
RUN npm install -g npm@12.2.2 \
  && npm ci --omit=dev \
  && PRISMA_VERSION="$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version")" \
  && npm install --no-save --omit=dev "prisma@${PRISMA_VERSION}" \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
  && mkdir -p /app/logs /app/uploads/chat-temp \
  && addgroup -S appgroup && adduser -S appuser -G appgroup \
  && chown -R appuser:appgroup /app

USER root

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/api/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
