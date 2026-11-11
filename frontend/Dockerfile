# ============================================================
# Multi-stage Dockerfile для FRONTEND
# Stage 1: build — компілюємо React додаток
# Stage 2: serve — подаємо статику через nginx
# ============================================================

# --- Stage 1: Build ---
FROM node:24-alpine AS builder

WORKDIR /app

# Копіюємо файли залежностей окремо для кешування шарів
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Копіюємо решту коду та збираємо
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Stage 2: Serve with unprivileged Nginx (listens on 8080) ---
FROM nginxinc/nginx-unprivileged:1.28-alpine3.23 AS production

COPY --from=builder --chown=nginx:nginx /app/build /usr/share/nginx/html
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx nginx/security-headers.conf /etc/nginx/security-headers.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
