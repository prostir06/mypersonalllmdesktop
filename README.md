# LLM Personal Assistant Control Panel

Personal LLM assistant control panel: Express + Prisma backend, React (Vite) frontend, OpenAI / Ollama providers.

## Features

- Multi-model chat (OpenAI, Ollama) with streaming and Stop
- Conversation history, rename, message search, Markdown export
- Settings (system prompt / roles, model params)
- JWT authentication
- Document upload for RAG (PDF, DOCX, TXT, MD)
- Docker Compose for local stack (pgvector + Prisma migrate)

## Project structure

```
.
├── backend/                 # Express API (JS entry + TypeScript modules via ts-node)
│   ├── prisma/              # Prisma schema & migrations
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── config/          # prisma.ts, database.js (health)
│   │   └── utils/
│   ├── database.sql         # Optional/legacy SQL bootstrap for Docker init
│   └── Dockerfile
├── frontend/                # React + Vite SPA
│   ├── src/
│   └── Dockerfile
├── docs/superpowers/specs/  # Design specs
├── docker-compose.yml       # Local/dev stack
├── docker-compose.prod.yml  # Production overrides (required secrets)
├── .env.example             # Root Compose env template
```

## Quick start

### Without Docker

#### 1. PostgreSQL

```bash
createdb llm_assistant
```

Use Prisma migrations from `backend/` (preferred). Fresh Docker Compose applies migrations via `docker-entrypoint.sh` (pgvector image). Do not use `database.sql` for new installs.

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL, JWT_SECRET, OPENAI_API_KEY
npm install
npx prisma generate --config prisma/prisma.config.ts
npx prisma migrate deploy --config prisma/prisma.config.ts
npm run dev
```

#### 2. Frontend

```bash
cd frontend
cp .env.example .env
# Vite proxies `/api` → backend in dev; leave as `/api` or omit.
# VITE_API_URL=/api
npm install
npm start
```

App: http://localhost:3000. API: http://localhost:5000 (proxied via Vite `/api`).

### With Docker

**Local / development** (bind-mount, published Postgres `5432`, soft defaults):

```bash
cp .env.example .env
# Optional: set OPENAI_API_KEY
docker compose up -d --build
```

**Production** (required secrets, no host DB port, image `dist/` only):

```bash
cp .env.example .env
# Set strong JWT_SECRET and DB_PASSWORD (placeholders are rejected at boot)
# Set OPENAI_API_KEY if using OpenAI
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Postgres uses `pgvector/pgvector:pg15`. On first boot the backend runs `prisma migrate deploy` (schema includes vector embeddings for RAG).

**Existing volumes created with the old `database.sql` init:** recreate once so pgvector is available:

```bash
docker compose down -v
docker compose up -d --build
```

Frontend (nginx): http://localhost:3000 — `/api` is proxied to the backend container.

## Auth

No default users. Register via `POST /api/auth/register` or the UI.

## Configuration

### Backend (`.env` — see `backend/.env.example`)

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password@localhost:5432/llm_assistant
DB_HOST=localhost
DB_PORT=5432
DB_NAME=llm_assistant
DB_USER=postgres
DB_PASSWORD=password
JWT_SECRET=your_jwt_secret_key_change_this_in_production
JWT_EXPIRE=7d
OPENAI_API_KEY=your_openai_api_key_here
OLLAMA_API_URL=http://127.0.0.1:11434/v1/chat/completions
CORS_ORIGIN=http://localhost:3000
```

### Frontend (`.env` — see `frontend/.env.example`)

```env
# Same-origin (Docker nginx / Vite proxy). Optional absolute URL for special setups.
VITE_API_URL=/api
```

## Main API

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`

### Chat
- `POST /api/chat/send`
- `POST /api/chat/stream`
- `GET /api/chat/history/:conversationId`
- `GET /api/chat/search`

### Conversations
- `GET|POST /api/conversations`
- `GET|PUT|DELETE /api/conversations/:id`

### Documents (RAG)
- `POST /api/documents/upload`
- `GET /api/documents`
- `DELETE /api/documents/:id`

### Models / Settings / Users
- `/api/models`, `/api/settings`, `/api/users/me`

## Development

### Backend

```bash
cd backend
npm run dev      # nodemon + ts-node (src)
npm test         # Jest
npm run build    # emit dist/
npm start        # node dist/server.js
```

### Frontend

```bash
cd frontend
npm start        # vite
npm run build    # production build
npm run serve    # preview build
```

## Notes

- Prefer Prisma migrations (`backend/prisma/`) as schema source of truth. `database.sql` is deprecated (no pgvector); Docker uses `pgvector/pgvector:pg15` + `prisma migrate deploy`.
- Do not commit `.env` or `docs/superpowers/plans/` (local scratch; specs under `docs/superpowers/specs/` are tracked).
- Extra Ollama hosts: set `OLLAMA_URL_ALLOWLIST` (comma-separated hostnames).

## License

MIT (add a `LICENSE` file if you redistribute publicly).
