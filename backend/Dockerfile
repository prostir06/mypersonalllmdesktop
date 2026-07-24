# ============================================================
# Multi-stage Dockerfile для BACKEND
# Stage 1: deps — встановлення залежностей
# Stage 2: production — мінімальний runtime образ
# ============================================================

# --- Stage 1: Dependencies ---
FROM node:20-alpine AS deps

WORKDIR /app

# Встановлюємо системні залежності для native modules (pg)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

# --- Stage 2: Production runtime ---
FROM node:20-alpine AS production

WORKDIR /app

# Копіюємо тільки необхідне
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

# Не запускаємо від root-користувача
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Запускаємо безпосередньо через node (без nodemon)
CMD ["node", "src/server.js"]
