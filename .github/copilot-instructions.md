# Copilot Instructions

Workspace for **LLM Personal Assistant Control Panel** (full-stack AI studio).

## Stack

- **backend/** — Express API (TypeScript; entry `src/server.ts` → `dist/`), Prisma 7, PostgreSQL + `pgvector`
- **frontend/** — React 18 + Vite 8 + TypeScript + Bootstrap 5 + TanStack Query
- **desktop/** — Electron shell (Windows-first, optional)
- **e2e/** — Playwright end-to-end suite against the Docker Compose stack
- **docker-compose.yml** / **docker-compose.prod.yml** — Postgres (`pgvector:pg15`) + backend + frontend (Nginx)

Providers: **OpenAI**, **Anthropic Claude**, **Google Gemini** (with Google Search Grounding), and **Ollama** (local chat + optional `nomic-embed-text` embeddings).
Auth: short-lived JWT access token + `httpOnly` opaque refresh cookie. Per-user API keys encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`).
RAG: Hybrid retrieval (`pgvector` cosine similarity + PostgreSQL `tsvector` full-text search) across PDF, DOCX, XLSX (`exceljs`), TXT, and MD documents, plus inline chat attachments.

## Ports

- Frontend (Vite / Docker Nginx): http://localhost:3000
- Backend API: http://localhost:5000 (`/api`)

## Important paths

- Backend routes & validators: `backend/src/routes/`, `backend/src/validators/`
- Backend services (chat, RAG, providers, memory): `backend/src/services/`
- Frontend components (chat, artifacts, settings): `frontend/src/components/`
- HTTP client: `frontend/src/services/api/` (barrel: `frontend/src/services/api.ts`)
- Prisma schema & migrations: `backend/prisma/`
- Design specs: `docs/superpowers/specs/`

## Local run

1. Copy `backend/.env.example` → `backend/.env` and set `DATABASE_URL`, `JWT_SECRET`, and any provider keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`)
2. `cd backend && npm install && npx prisma generate --config prisma/prisma.config.ts && npx prisma migrate deploy --config prisma/prisma.config.ts && npm run dev`
3. `cd frontend && npm install && npm start`

Or via Docker: `cp .env.example .env && docker compose up -d --build` (never commit `.env`).
