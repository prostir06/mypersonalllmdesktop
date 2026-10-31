# ============================================================
# Multi-stage Dockerfile for BACKEND
# Image build emits dist/; production entrypoint runs node dist/server.js.
# Default compose may bind-mount ./backend (dev) and fall back to ts-node.
# ============================================================

# --- Stage 1: Dependencies + Prisma Client ---
FROM node:24-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
# generate потребує URL у prisma.config; значення лише для генерації клієнта
ENV DATABASE_URL="postgresql://postgres:password@localhost:5432/llm_assistant"
RUN npx prisma generate --config prisma/prisma.config.ts

# --- Stage 2: Production runtime ---
FROM node:24-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh

USER root
RUN apk add --no-cache su-exec \
  && chmod +x /app/docker-entrypoint.sh \
  && mkdir -p /app/logs /app/uploads/chat-temp \
  && npm run build \
  && addgroup -S appgroup && adduser -S appuser -G appgroup \
  && chown -R appuser:appgroup /app
# Entrypoint starts as root to chown named volumes, then drops to appuser via su-exec.
USER root

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
