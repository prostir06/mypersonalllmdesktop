# Copilot Instructions

Це workspace для панелі керування персональним LLM-помічником.

## Структура проекту

- **backend/** - Node.js/Express API з інтеграцією OpenAI
- **frontend/** - React SPA з Bootstrap стилем
- **docker-compose.yml** - Docker конфігурація для легкого запуску

## Сток:
- React 18 + Bootstrap 5
- Node.js/Express
- PostgreSQL
- OpenAI API
- JWT для аутентифікації

## Настройка OpenAI API

1. Отримайте API ключ з https://platform.openai.com/api-keys
2. Додайте в `.env`:
   ```
   OPENAI_API_KEY=sk_test_...
   ```

## Запуск проекту

### Docker (рекомендовано)
```bash
export OPENAI_API_KEY=your_key
docker-compose up
```

### Локально
1. Установіть PostgreSQL
2. `cd backend && npm install && npm run dev`
3. `cd frontend && npm install && npm start`

## Важные файлы

- [Backend Routes](backend/src/routes/) - API endpoints
- [Frontend Components](frontend/src/components/) - React компоненти
- [Database Schema](backend/database.sql) - БД структура
- [API Service](frontend/src/services/api.js) - HTTP клієнт
