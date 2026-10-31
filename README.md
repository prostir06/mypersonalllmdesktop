# LLM Personal Assistant Control Panel

Self-hosted personal AI assistant studio with a **TypeScript Express + Prisma** backend, **React 18 + Vite** frontend, **PostgreSQL + pgvector** hybrid RAG, interactive HTML/SVG artifact previews, and an optional **Electron** desktop shell.

Supports **OpenAI**, **Anthropic Claude**, **Google Gemini** (with live Google Search Grounding), and **Ollama** local models.

---

## Features

- **Multi-Provider Streaming Chat:** Real-time SSE token streaming and instant Stop across **OpenAI**, **Anthropic Claude**, **Google Gemini**, and **Ollama**.
- **Multimodal Vision & Inline File Attachments:** Analyze images (PNG, JPEG, WEBP, GIF) with vision-capable models and attach PDF, DOCX, XLSX, TXT, or MD files directly into a conversation turn.
- **Interactive Artifacts Split-View:** Render generated HTML and SVG blocks inside a sandboxed preview pane (`/artifact-sandbox.html` with isolated CSP), switch between **Preview / Code**, copy, download, or inspect in fullscreen.
- **Google Search Grounding:** Toggle live web search on Gemini models with clickable external source citations below assistant replies.
- **Hybrid RAG Knowledge Base:** Asynchronous background document indexing (`PDF`, `DOCX`, `XLSX` via `exceljs`, `TXT`, `MD`) combining **`pgvector` semantic embeddings** (OpenAI or local Ollama `nomic-embed-text`) with **PostgreSQL Full-Text Search (`tsvector`)** reciprocal fusion, chunk preview, retry, and one-click re-indexing.
- **Dual-Layer AI Memory:**
  - *Conversation Memory:* rolling auto-summary + pinned per-conversation notes.
  - *Global User Memory:* cross-conversation facts and preferences managed in Settings and injected into prompts.
- **System Self-Knowledge & Live Advisor (`🧭 Гід`):** Built-in drift-proof knowledge registry (`GET /api/system/knowledge`) and two-tier contextual prompt injection. The assistant introspects its features, limits, and user readiness without leaking secrets, offering proactive Ukrainian advisory chips, searchable settings/feature documentation, and deep-linkable quick actions.
- **Workspace Productivity:** Pinned conversations, reusable **Prompt Library**, message branching / regeneration, full-text message search, and Markdown / JSON / PDF export.
- **Token & Cost Telemetry:** Optional per-message token usage (`prompt` / `completion` / `total`) and estimated USD cost badge.
- **Security & Auth:** Short-lived JWT access tokens + `httpOnly` rotating refresh cookies, AES-256-GCM encrypted per-user API keys (`ENCRYPTION_KEY`), SSRF-guarded Ollama URL allowlist, magic-byte upload verification, and strict Nginx Content-Security-Policy.

---

## Project Structure

```text
.
├── backend/                 # Express + TypeScript API (src/ → dist/)
│   ├── prisma/              # Prisma 7 schema + 18 SQL migrations (pgvector + FTS)
│   ├── src/
│   │   ├── config/          # Env validation, Prisma pg pool, model pricing
│   │   ├── controllers/     # Thin HTTP controllers
│   │   ├── middleware/      # JWT auth, rate-limit, multer magic-byte upload
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # Chat, Hybrid RAG, OpenAI/Claude/Gemini/Ollama, Memory
│   │   ├── utils/           # AES-256-GCM crypto, SSRF allowlist, job queue
│   │   └── validators/      # express-validator rules
│   └── Dockerfile           # Multi-stage Node 24 Alpine image
├── frontend/                # React 18 + Vite 8 + TypeScript SPA
│   ├── public/              # Static assets & isolated artifact-sandbox.html
│   ├── src/                 # Components, hooks, typed API client, military theme
│   ├── nginx.conf           # SPA routing, /api proxy, hardened CSP headers
│   └── Dockerfile           # Node 24 builder → Nginx 1.25 Alpine
├── desktop/                 # Optional Electron desktop shell (Windows-first)
├── e2e/                     # Playwright E2E test suite (13 specs)
├── docs/                    # Architecture specs & security/perf baselines
├── docker-compose.yml       # Local/dev stack (Postgres pgvector + API + UI)
├── docker-compose.prod.yml  # Production overrides (mandatory secrets, no host DB port)
└── .env.example             # Root Docker Compose environment template
```

---

## Quick Start

### Option A: With Docker Compose (Recommended)

Requires **Docker** and **Docker Compose**.

```bash
cp .env.example .env
# Optional: set OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY
# (API keys can also be added per-user in the UI under Settings → API Keys)

docker compose up -d --build
```

- **Web UI:** http://localhost:3000 (`/api` is proxied by Nginx to the backend container)
- **API Healthcheck:** http://localhost:5000/api/health

On startup, `backend/docker-entrypoint.sh` waits for `pgvector/pgvector:pg15`, applies `prisma migrate deploy`, and launches the server.

#### Production Compose Deployment

Production mode disables source bind-mounts, hides PostgreSQL from host ports, and enforces non-placeholder secrets at boot:

```bash
cp .env.example .env
# Required in .env: strong JWT_SECRET, DB_PASSWORD, and ENCRYPTION_KEY (openssl rand -base64 32)
# Recommended: ALLOW_REGISTRATION=false (default in production when unset)

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

### Option B: Local Development (Without Docker)

Prerequisites: **Node.js 22.22+ or 24 LTS** (Node 24 recommended) and **PostgreSQL 15+ with `pgvector`**.

#### 1. Backend

```bash
createdb llm_assistant

cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, and optional provider keys
npm install
npx prisma generate --config prisma/prisma.config.ts
npx prisma migrate deploy --config prisma/prisma.config.ts
npm run dev
```

#### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm start
```

Open http://localhost:3000 (Vite proxies `/api` to `http://localhost:5000`).

#### 3. Desktop Shell (Electron, Optional)

See [`desktop/README.md`](desktop/README.md) for full details:

```bash
# With backend + frontend running:
cd desktop
npm install
npm run dev
```

Build a Windows NSIS / portable installer (after `cd frontend && npm run build`):

```bash
cd desktop && npm run dist
```

---

## LLM Providers & Configuration

Provider keys can be configured globally in `.env` or per-user in **Settings → API Keys** (encrypted server-side with AES-256-GCM; per-user keys take precedence over server `.env` keys):

| Provider | Example Models | Highlights |
|----------|----------------|------------|
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo` | Streaming chat, vision, OpenAI RAG embeddings (`768` dim) |
| **Anthropic Claude** | `claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest` | Streaming SSE (`text_delta`), vision attachments, code & HTML/SVG artifacts |
| **Google Gemini** | `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash` | Multimodal vision, **Google Search Grounding** toggle & clickable web citations |
| **Ollama (Local)** | `llama3`, `qwen2.5`, `mistral`, `llava` | Local/LAN inference via `OLLAMA_API_URL` + local RAG embeddings (`nomic-embed-text`) |

### Key Environment Variables (`backend/.env`)

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password@localhost:5432/llm_assistant
JWT_SECRET=your_jwt_secret_key_change_this_in_production
JWT_ACCESS_EXPIRE=15m
JWT_REFRESH_EXPIRE=30d
ENCRYPTION_KEY=               # 32-byte base64 or 64 hex chars (required in production)
ALLOW_REGISTRATION=true       # unset = allow in dev, deny in production
OPENAI_API_KEY=               # optional
GEMINI_API_KEY=               # optional
ANTHROPIC_API_KEY=            # optional
OLLAMA_API_URL=http://127.0.0.1:11434/v1/chat/completions
OLLAMA_EMBED_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
CORS_ORIGIN=http://localhost:3000
```

---

## Main API Endpoints

### Auth & Health
- `GET /api/health` — Database & readiness probe
- `POST /api/auth/register` — Create user account (gated by `ALLOW_REGISTRATION`)
- `POST /api/auth/login` — Issue JWT access token + `httpOnly` refresh cookie
- `POST /api/auth/refresh` — Rotate refresh cookie & issue new access token
- `POST /api/auth/logout` — Revoke refresh session

### Chat & Attachments
- `POST /api/chat/send` — Non-streaming chat completion
- `POST /api/chat/stream` — SSE streaming chat (`init`, `token`, `token_usage`, `done`)
- `POST /api/chat/attachments` — Extract inline document attachment text for chat context
- `GET /api/chat/history/:conversationId` — Linearized + branched conversation history
- `GET /api/chat/search` — Full-text message search

### Conversations & Memory
- `GET | POST /api/conversations` — Paginated list (pinned-first) & create
- `GET | PUT | DELETE /api/conversations/:id` — Fetch, rename, delete
- `PATCH /api/conversations/:id/pin` — Pin / unpin conversation
- `GET /api/conversations/:id/export` — Export (`md`, `json`, `txt`)
- `GET /api/conversations/:id/memory` & `POST .../memory/refresh-summary` — Auto-summary & notes
- `POST | PATCH | DELETE /api/conversations/:id/memory-notes/:noteId?` — Per-conversation memory notes
- `GET | POST | PATCH | DELETE /api/users/me/memory-notes/:noteId?` — Global cross-conversation memory

### Documents (Hybrid RAG)
- `POST /api/documents/upload` — Async upload (`202 Accepted`) & background indexing
- `GET /api/documents` & `GET /api/documents/:id` — Status, chunk counts, embedding mode
- `GET /api/documents/:id/chunks` — Paginated chunk preview
- `POST /api/documents/:id/retry` — Retry failed indexing job
- `POST /api/documents/:id/reindex` — Re-embed existing chunks with active embedding provider
- `DELETE /api/documents/:id` — Delete document & vectors

### Models, Prompts, Settings & Profile
- `GET | POST | PUT | DELETE /api/models` & `GET /api/models/remote` — Model catalog & Ollama discovery
- `GET | POST | PUT | DELETE /api/prompts` — Reusable prompt templates
- `GET | PUT /api/settings` — Generation defaults, system prompt, encrypted provider keys
- `GET | PUT /api/users/me` — User profile

---

## Testing & Quality Gates

```bash
# Backend: ESLint, TypeScript, Jest unit/integration tests, security audit
cd backend
npm run lint
npm run typecheck
npm test
npm run audit:ci

# Frontend: ESLint, TypeScript, Vitest unit tests, production Vite build
cd frontend
npm run lint
npm run typecheck
npm test
npm run build

# Desktop: TypeScript build + Node test runner
cd desktop
npm test

# End-to-End (Playwright against running Docker stack)
cd e2e
npm ci
npx playwright install chromium
npm test
```

---

## Troubleshooting & Notes

- **Docker entrypoint line endings on Windows:** `.gitattributes` enforces `LF` on `*.sh`. If `docker-entrypoint.sh` ever acquires `CRLF`, convert back to `LF` before bind-mounting.
- **After adding a backend npm package in dev Docker:** recreate the anonymous `node_modules` volume via `docker compose up -d --build --force-recreate --renew-anon-volumes backend`.
- **Extra Ollama LAN hosts:** add comma-separated hostnames to `OLLAMA_URL_ALLOWLIST` in `.env`.
- **References:**
  - Design specifications: [`docs/superpowers/specs/`](docs/superpowers/specs/README.md)
  - Security audit baseline: [`docs/security-audit-baseline.md`](docs/security-audit-baseline.md) (`2026-10-30`, 0 high/critical backend advisories)
  - Performance SLI baseline: [`docs/perf-baseline-2026-09-21.md`](docs/perf-baseline-2026-09-21.md)

## License

MIT — see [LICENSE](LICENSE).
