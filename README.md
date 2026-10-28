# LLM Personal Assistant Control Panel

Personal LLM assistant control panel: Express + Prisma backend, React (Vite) frontend, OpenAI, Ollama, and Google Gemini providers.

## Features

- Multi-model chat (OpenAI, Ollama, Google Gemini) with streaming and Stop
- Multimodal vision support (upload and analyze images with vision-capable models like Gemini)
- Google Search Grounding with live web search toggle and clickable source citations
- Conversation history, rename, message search, Markdown / PDF export
- Conversation memory: auto summary + editable notes (RAG context)
- Cross-conversation user memory notes (Settings → inject into chat context)
- Settings (system prompt / roles, model params, encrypted OpenAI and Google Gemini API keys)
- JWT authentication (access + httpOnly refresh cookie)
- Document upload for RAG (PDF, DOCX, XLSX, TXT, MD)
- Semantic RAG: OpenAI embeddings or local Ollama (`nomic-embed-text`)
- Docker Compose for local stack (pgvector + Prisma migrate)
- Optional Electron desktop shell (Windows-first)

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
├── e2e/                     # Playwright smoke (Docker stack)
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
# Set DATABASE_URL, JWT_SECRET, OPENAI_API_KEY (or GEMINI_API_KEY)
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
# Optional: set OPENAI_API_KEY, GEMINI_API_KEY
# Fresh clone / first up: anonymous node_modules volume is created on start.
docker compose up -d --build
# After adding a backend npm dependency: recreate that volume
# docker compose up -d --build --force-recreate --renew-anon-volumes backend
```

**Production** (required secrets, no host DB port, image `dist/` only — no ts-node fallback):

```bash
cp .env.example .env
# Required: strong JWT_SECRET, DB_PASSWORD, ENCRYPTION_KEY (placeholders rejected at boot)
# Optional: OPENAI_API_KEY, GEMINI_API_KEY, ALLOW_REGISTRATION=false (default deny when NODE_ENV=production)
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
- **Stale API after code change (dev bind-mount):** `docker compose exec backend npm run build && docker compose restart backend` (entrypoint runs `prisma generate` on start; re-run if schema changed).
- **`Cannot find module` after adding an npm dependency:** anonymous `/app/node_modules` volume is stale. Recreate: `docker compose up -d --force-recreate --renew-anon-volumes backend`.
- **`EACCES mkdir /app/uploads`:** default compose mounts named volume `backend_uploads` and entrypoint chowns it for `appuser`. Recreate: `docker compose up -d --build --force-recreate backend`.
- **RAG embeddings:** auto mode — OpenAI key (settings/env) uses OpenAI embeddings (768 dim); else if provider is Ollama, local `nomic-embed-text` via Ollama `/api/embeddings`. Without either, fallback chunk selection. Pull model: `ollama pull nomic-embed-text`. Re-index existing docs via «Переіндексувати» in RAG manager.

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
GEMINI_API_KEY=   # optional Google Gemini key (or set in UI Settings)
OLLAMA_API_URL=http://127.0.0.1:11434/v1/chat/completions
# OLLAMA_EMBED_MODEL=nomic-embed-text
# EMBEDDING_DIMENSIONS=768
# DB_POOL_MAX=10   # Prisma pg pool (default 10)
CORS_ORIGIN=http://localhost:3000
```

### Frontend (`.env` — see `frontend/.env.example`)

```env
# Same-origin (Docker nginx / Vite proxy). Optional absolute URL for special setups.
VITE_API_URL=/api
```

### LLM Providers & Models

The assistant supports three LLM providers configurable globally via environment variables or per-user in **Settings**:

- **OpenAI**: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo`. Configured via `OPENAI_API_KEY`.
- **Ollama**: Local models (`llama3`, `mistral`, `qwen`, etc.) via `OLLAMA_API_URL`.
- **Google Gemini**: Native Google Gemini models with multimodal vision and web search grounding:
  - `gemini-2.0-flash` (recommended default — fast, multimodal, supports web search grounding)
  - `gemini-1.5-flash` (efficient general-purpose multimodal model)
  - `gemini-1.5-pro` (high-capacity multimodal reasoning model)

#### Google Gemini Configuration & Features

1. **API Key Setup**:
   - Obtain an API key from [Google AI Studio](https://aistudio.google.com/apikey).
   - Global default: set `GEMINI_API_KEY=AIzaSy...` in `backend/.env`.
   - Per-user: navigate to **Settings → Google Gemini API Key** in the UI, enter the key, and click Save. The key is encrypted server-side with AES-256-GCM (`ENCRYPTION_KEY`). User key takes precedence over global key.
2. **Multimodal Vision**:
   - Attach image files (PNG, JPEG, WEBP, GIF, up to 5MB) directly in chat messages.
   - Images are processed in-memory, converted to Gemini inline data parts, and analyzed natively with visual reasoning.
3. **Google Search Grounding & Citations**:
   - Toggle **Пошук в інтернеті** (Web Search) above the chat input when using any Gemini model.
   - When enabled, Gemini grounds responses with Google Search results.
   - Grounded responses include clickable source citations rendered in a dedicated **Джерела** (Sources) card below the message, linking to original external URLs.

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
- `GET /api/conversations/:id/export`

### Conversation memory
- `GET /api/conversations/:id/memory`
- `POST /api/conversations/:id/memory-notes`
- `PATCH /api/conversations/:id/memory-notes/:noteId`
- `DELETE /api/conversations/:id/memory-notes/:noteId`
- `POST /api/conversations/:id/memory/refresh-summary`

### Documents (RAG)
- `POST /api/documents/upload`
- `GET /api/documents`
- `GET /api/documents/:id`
- `GET /api/documents/:id/chunks`
- `POST /api/documents/:id/retry`
- `POST /api/documents/:id/reindex`
- `DELETE /api/documents/:id`

### User memory (cross-conversation)
- `GET /api/users/me/memory-notes`
- `POST /api/users/me/memory-notes`
- `PATCH /api/users/me/memory-notes/:noteId`
- `DELETE /api/users/me/memory-notes/:noteId`

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
- Do not commit `.env`. Design specs live under `docs/superpowers/specs/` (tracked). Most implementation plans under `docs/superpowers/plans/` are gitignored; a few recent wave plans may be force-tracked.
- Extra Ollama hosts: set `OLLAMA_URL_ALLOWLIST` (comma-separated hostnames).
- Perf SLIs: `cd backend && npm run perf:baseline` → record in [`docs/perf-baseline-2026-09-21.md`](docs/perf-baseline-2026-09-21.md). Knobs: `OLLAMA_EMBED_CONCURRENCY`, `CHAT_HISTORY_RAW_CAP`.
- E2E smoke (Playwright + Docker): `cd e2e && npm ci && npx playwright install chromium && npm test` with stack up; CI workflow `e2e-smoke.yml` (manual/nightly). Specs: `login`, `smoke`, `stream`, `stream-stop`, `settings`, `rag-upload`, `rag-xlsx`, `conversation-query`, plus deeper citation/memory coverage where enabled.
- **npm audit baseline:** [docs/security-audit-baseline.md](docs/security-audit-baseline.md) (2026-08-19).

## Pre-upload checklist

- [ ] Working tree clean (`git status`); clear local `backend/uploads/` if present
- [ ] No `.env` / secrets staged (only `*.env.example` tracked)
- [ ] `backend` / `frontend` / `desktop` unit tests green
- [ ] Docker stack healthy: `docker compose up -d --build` → http://localhost:3000 (`/api/health` OK)
- [ ] After new backend npm deps: `--renew-anon-volumes backend`
- [ ] Push via PR from a feature branch → `master` (never commit real `.env`)

## License

MIT — see [LICENSE](LICENSE).
