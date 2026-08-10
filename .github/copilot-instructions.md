# Copilot Instructions

Workspace for a personal LLM assistant control panel.

## Stack

- **backend/** — Express API (mostly TypeScript; `server.js` / `logger.js` entry), Prisma, PostgreSQL/pgvector
- **frontend/** — React 18 + Vite + TypeScript + Bootstrap 5
- **desktop/** — Electron shell (optional)
- **docker-compose.yml** — Postgres + backend + frontend

Providers: OpenAI API, Ollama (chat + optional local embeddings). Auth: JWT + refresh cookies.

## Ports

- Frontend (Vite / Docker): http://localhost:3000
- Backend API: http://localhost:5000 (`/api`)

## Important paths

- Backend routes: `backend/src/routes/`
- Frontend components: `frontend/src/components/`
- HTTP client: `frontend/src/services/api.ts`
- Prisma schema: `backend/prisma/schema.prisma`
- Design specs: `docs/superpowers/specs/`

## Local run

1. Copy `backend/.env.example` → `backend/.env` and set `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`
2. `cd backend && npm install && npx prisma migrate deploy --config prisma/prisma.config.ts && npm run dev`
3. `cd frontend && npm install && npm start`

Or: `docker compose up -d` with secrets in the environment (never commit `.env`).
