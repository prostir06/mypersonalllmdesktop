# ============================================================
# Multi-stage Dockerfile для FRONTEND
# Stage 1: build — компілюємо React додаток
# Stage 2: serve — подаємо статику через nginx
# ============================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Копіюємо файли залежностей окремо для кешування шарів
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Копіюємо решту коду та збираємо
COPY . .
ARG VITE_API_URL=http://localhost:5000/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Stage 2: Serve with Nginx ---
FROM nginx:1.25-alpine AS production

# Копіюємо зібраний статичний додаток
COPY --from=builder /app/build /usr/share/nginx/html

# Копіюємо nginx конфіг (SPA підтримка — всі шляхи → index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
