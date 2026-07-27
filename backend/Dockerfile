# ============================================================
# Multi-stage Dockerfile для BACKEND
# Auth і Prisma-конфіг — TypeScript; runtime через ts-node/register
# (docker-compose монтує ./backend поверх /app, тому потрібен ts-node у image)
# ============================================================

# --- Stage 1: Dependencies + Prisma Client ---
FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
# generate потребує URL у prisma.config; значення лише для генерації клієнта
ENV DATABASE_URL="postgresql://postgres:password@localhost:5432/llm_assistant"
RUN npx prisma generate --config prisma/prisma.config.ts

# --- Stage 2: Production runtime ---
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY src ./src

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "-r", "ts-node/register", "src/server.js"]
