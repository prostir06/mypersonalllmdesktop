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
├── backend/                 # Express API (TypeScript → dist/)
│   ├── prisma/              # Schema source of truth + migrations (pgvector)
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── config/
│   │   └── utils/
│   └── Dockerfile
├── frontend/                # React + Vite SPA
│   ├── src/
│   └── Dockerfile
├── desktop/                 # Electron shell (Windows-first)
│   └── src/
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

Use Prisma migrations from `backend/` as the only schema source of truth. Fresh Docker Compose applies them via `docker-entrypoint.sh` on `pgvector/pgvector:pg15`.

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

#### 3. Desktop (Electron, optional)

See [`desktop/README.md`](desktop/README.md). Short version:

```bash
# API + Vite running, then:
cd desktop && npm install && npm run dev
```

Packaged Windows build (after `frontend` production build): `cd desktop && npm run dist`.

### With Docker

**Default `docker compose` = local/dev** (bind-mount of `./backend`, published Postgres `5432`, soft secret defaults). Prefer rebuilding host `backend/dist` after code changes, or use prod compose so the image `dist/` is authoritative.

```bash
cp .env.example .env
# Optional: set OPENAI_API_KEY
docker compose up -d --build
```

**Production** (required secrets, no host DB port, image `dist/` only — no ts-node fallback):

```bash
cp .env.example .env
# Required: strong JWT_SECRET, DB_PASSWORD, ENCRYPTION_KEY (placeholders rejected at boot)
# Optional: OPENAI_API_KEY, ALLOW_REGISTRATION=false (default deny when NODE_ENV=production)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Postgres uses `pgvector/pgvector:pg15`. On first boot the backend runs `prisma migrate deploy` (schema includes vector embeddings for RAG).

**Existing volumes created before Prisma/pgvector:** recreate once so the vector extension is available:

```bash
docker compose down -v
docker compose up -d --build
```

Frontend (nginx): http://localhost:3000 — `/api` is proxied to the backend container.

### Docker troubleshooting

- **Entrypoint `set: illegal option -`:** bind-mounted `docker-entrypoint.sh` with Windows CRLF line endings. Fix: ensure LF (`.gitattributes` sets `*.sh eol=lf`) or rebuild without bind-mount (`docker-compose.prod.yml`).
- **Upload / Prisma field errors after code update:** stale generated client in the container volume. Run `docker compose exec backend npx prisma generate --config prisma/prisma.config.ts` and restart the backend.
- **RAG embeddings:** document upload works without OpenAI key, but semantic search needs a valid key in settings or `OPENAI_API_KEY`. Without it, chunk selection falls back to non-vector heuristics.

## Auth

No default users. Register via `POST /api/auth/register` or the UI when allowed.

Registration is gated by `ALLOW_REGISTRATION`:
- unset → allowed when `NODE_ENV` is not `production`, denied in production
- `true` / `false` → explicit override (use `false` for personal/prod deploys)

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
JWT_ACCESS_EXPIRE=15m
JWT_REFRESH_EXPIRE=30d
ENCRYPTION_KEY=   # required in production (compose prod + entrypoint)
OPENAI_API_KEY=your_openai_api_key_here
OLLAMA_API_URL=http://127.0.0.1:11434/v1/chat/completions
# DB_POOL_MAX=10   # Prisma pg pool (default 10)
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
npm run build:analyze   # build + build/stats.html (rollup visualizer)
npm run serve    # preview build
```

#### Bundle budget (production, gzip)

Measured after `manualChunks` split (Dashboard/Settings/Profile lazy-loaded):

| Chunk | ~gzip | Notes |
|-------|-------|-------|
| `bootstrap-ui` (JS+CSS) | ~92 KB | global Bootstrap + react-bootstrap; trim deferred |
| `axios` | ~17 KB | API client |
| `query` | ~9 KB | React Query |
| `router` | ~8 KB | react-router |
| `index` (shell) | ~7 KB | auth shell, Login/Register |
| `Dashboard` (route) | ~12 KB | + lazy `markdown` (~35 KB) + `syntax-highlighter` (~22 KB) on first chat open |

**Tradeoff:** full `bootstrap.min.css` (~31 KB gzip) stays in entry for simplicity. Code-splitting keeps markdown/highlighter off login/settings routes.

```bash
cd frontend && npm run build:analyze
# open frontend/build/stats.html
```

## Notes

- Schema source of truth: `backend/prisma/` + `prisma migrate deploy`. Docker image: `pgvector/pgvector:pg15`.
- Do not commit `.env` or `docs/superpowers/plans/` (local scratch; specs under `docs/superpowers/specs/` are tracked).
- Extra Ollama hosts: set `OLLAMA_URL_ALLOWLIST` (comma-separated hostnames).

## License

MIT — see [LICENSE](LICENSE).
