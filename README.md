# LLM Personal Assistant Control Panel

Повнофункціональна панель керування персональним помічником з інтеграцією OpenAI API.

## 🎯 Можливості

- ✅ Чат з LLM-помічником (OpenAI, Ollama)
- ✅ Управління різними моделями LLM
- ✅ Вибір провайдера AI (OpenAI, Ollama)
- ✅ Збереження історії розмов
- ✅ Налаштування параметрів (temperature, max_tokens)
- ✅ Аутентифікація користувачів
- ✅ Завантаження файлів
- ✅ Адаптивний дизайн з Bootstrap

## 📋 Структура проекту

```
.
├── backend/               # Node.js/Express API
│   ├── src/
│   │   ├── routes/       # API маршрути
│   │   ├── controllers/  # Логіка контролерів
│   │   ├── models/       # Моделі даних
│   │   ├── middleware/   # Middleware (auth, etc)
│   │   ├── services/     # Зовнішні сервіси (OpenAI)
│   │   └── config/       # Конфігурація
│   ├── database.sql      # Схема БД
│   └── Dockerfile
├── frontend/             # React SPA
│   ├── src/
│   │   ├── components/   # React компоненти
│   │   ├── pages/        # Сторінки
│   │   ├── services/     # API клієнт
│   │   ├── context/      # React Context
│   │   └── styles/       # CSS стилі
│   └── Dockerfile
└── docker-compose.yml    # Docker Compose конфігурація
```

## 🚀 Швидкий старт

### Без Docker

#### 1. Налаштування БД (PostgreSQL)

```bash
# Створіть БД
createdb llm_assistant

# Зареєструйте схему
psql -U postgres -d llm_assistant -f backend/database.sql
```

#### 2. Backend

```bash
cd backend
cp .env.example .env
# Відредагуйте .env та додайте OPENAI_API_KEY
npm install
npm run dev
```

#### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm start
```

### З Docker

```bash
# Налаштуйте OPENAI_API_KEY
export OPENAI_API_KEY=your_api_key_here

# Запустіть контейнери
docker-compose up -d

# Ініціалізуйте БД (при першому запуску)
docker exec llm-assistant-db psql -U postgres -d llm_assistant -f /docker-entrypoint-initdb.d/01-schema.sql
```

Додаток буде доступний на http://localhost:3000

## 🔐 Умовчувані облікові дані

Перед першим запуском створіть облік. Немає умовчувань для безпеки.

## ⚙️ Конфігурація

### Backend (.env)

```env
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=llm_assistant
DB_USER=postgres
DB_PASSWORD=password

# JWT
JWT_SECRET=your_secret_key_here
JWT_EXPIRE=7d

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# CORS
CORS_ORIGIN=http://localhost:3000
```

### Frontend (.env)

```env
VITE_API_URL=http://localhost:5000/api
```

## 📚 API Endpoints

### Аутентифікація
- `POST /api/auth/register` - Реєстрація
- `POST /api/auth/login` - Вхід

### Чат
- `POST /api/chat/send` - Надіслати повідомлення
- `GET /api/chat/history/:conversationId` - Отримати історію

### Розмови
- `GET /api/conversations` - Всі розмови
- `POST /api/conversations` - Створити нову
- `GET /api/conversations/:id` - Отримати розмову
- `PUT /api/conversations/:id` - Оновити
- `DELETE /api/conversations/:id` - Видалити

### Моделі LLM
- `GET /api/models` - Всі доступні моделі
- `POST /api/models` - Додати власну модель
- `PUT /api/models/:id` - Оновити модель
- `DELETE /api/models/:id` - Видалити модель

### Користувач
- `GET /api/users/me` - Інформація про поточного користувача
- `PUT /api/users/me` - Оновити профіль

## 🔧 Розробка

### Backend
```bash
cd backend
npm run dev          # Режим розробки з nodemon
npm test             # Запустити тести
```

### Frontend
```bash
cd frontend
npm start            # Режим розробки
npm run build        # Білд для продакшену
npm test             # Запустити тести
```

## 📝 Ліцензія

MIT

## 🤝 Внесок

Вклади приймаються! Відкрийте PR або Issue.
