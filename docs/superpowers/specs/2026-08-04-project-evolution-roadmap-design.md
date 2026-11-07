# Project Evolution Roadmap — Design

**Date:** 2026-08-04  
**Status:** Superseded by `2026-08-05-project-evolution-v2-design.md` (P0–P4 implemented; use v2 for next work)  
**Scope:** Full-stack personal LLM control panel (`mypersonalllmdesktop`)

## 1. Current state (audit summary)

### What works
- Domain APIs migrated to TypeScript + Prisma (auth, settings, conversations, models, documents, users, chat, providers).
- Frontend on Vite; typed `frontend/src/services/api.ts` + SSE streaming client.
- Docker Compose stack runs; CI runs backend Jest + frontend `tsc`/build + image builds.
- Core chat with OpenAI / Ollama, documents upload path, settings/system prompt roles.

### Architecture (as-is)

```
Browser (Vite/nginx :3000)
  → HTTP/SSE → Express (server.js + ts-node) :5000
       → routes/*.ts → controllers → services
            → Prisma (DATABASE_URL)
            → OpenAI SDK / Ollama axios
       → /api/health → legacy pg Pool (DB_*)
Postgres (:5432) — Compose init: database.sql (no pgvector)
```

### Critical gaps
1. **Security:** `GET /api/models/remote` is unauthenticated; client-controlled `host` / `ollama_host` enable SSRF. JWT refresh uses `ignoreExpiration: true`.
2. **Schema drift:** Compose `database.sql` lacks `vector` / `embedding`; Prisma `0_init` has them → RAG broken on fresh Docker DB.
3. **Correctness:** `pdf-parse` used with v1 API while dep is v2; chat persist not transactional; dual DB config for health vs app.
4. **Frontend:** fat `ChatBoxOptimized.jsx`, no Stop/abort, settings not shared via React Query, no search UI despite API, no frontend tests, mostly `.jsx` / `strict: false`.
5. **Runtime:** production still interprets TS via `ts-node` (no `dist` emit).

## 2. Goals

| Horizon | Goal |
|---------|------|
| Near-term | Safe, schema-correct local Docker + reliable chat/RAG |
| Mid-term | Chat UX parity (Stop, sync settings, search/rename) + smaller bundle |
| Long-term | Typed UI, Vitest, optional desktop shell, real multi-provider |

Non-goals for this roadmap cycle: billing, multi-tenant SaaS, mobile apps.

## 3. Approach options

| Option | Description | Trade-off |
|--------|-------------|-----------|
| **A — Stabilize-first (recommended)** | P0 security/schema → P1 correctness → P2 UX → P3 features | Slower features; trustworthy base |
| B — Features-first | Search/Stop UI before SSRF/schema | Ships UX faster; leaves High security/RAG debt |
| C — Big-bang rewrite | Full TS emit + Electron + strict TS now | High risk; blocks shipping |

**Recommendation:** Option A.

## 4. Phases

### P0 — Security & schema truth (1–2 weeks)
- Auth + host allowlist for `/models/remote` and Ollama URLs.
- Cap JWT refresh (no infinite expired-token refresh).
- pgvector-capable Postgres image; boot via Prisma migrate; retire or generate `database.sql` from Prisma.
- Health check via Prisma only; remove split-brain `database.js` usage.

### P1 — Correctness & runtime (1–2 weeks)
- Fix pdf-parse v2 (+ tests for PDF/DOCX).
- `$transaction` for chat persist and document chunk inserts.
- `ensureConversationId` nullish check (not falsy).
- Compile backend to `dist/`; Docker CMD `node dist/...`; drop prod `ts-node`.

### P2 — Chat UX & structure (2 weeks)
- `AbortController` Stop; batch stream tokens (rAF).
- Chat reads settings from shared React Query cache; invalidate on Settings save.
- Split `ChatBoxOptimized` into hooks (`useChatStream`, `useDocuments`, `useSpeech`, `useChatSettings`).
- Lazy-load markdown/syntax highlighter.

### P3 — Product surface (2–3 weeks)
- Message search UI; conversation rename; wire server export.
- Model catalog CRUD UI (or simplify README claims).
- Honest provider list (hide fake Azure/ChatGPT aliases or implement real config).
- Ollama health / connection status in UI.

### P4 — Quality & desktop (ongoing)
- Vitest smoke tests; gradual `.tsx` + `strict`.
- nginx `/api` proxy + relative `VITE_API_URL=/api` for Compose.
- Optional Electron/Tauri shell.
- Coverage gates in CI; replace `new Function` math with safe parser.

## 5. Success metrics
- Fresh `docker compose up` → health ok, RAG embedding path available (vector extension present).
- Unauthenticated SSRF probes to `/models/remote` return 401.
- PDF upload extracts text in automated test.
- Chat Stop aborts in-flight stream.
- Changing Settings updates Chat provider/model without remount.
- Frontend main chunk reduced after lazy Prism (measure before/after).
- Backend starts from compiled `dist` in CI Docker build.

## 6. Risks
- Migrating existing Compose volumes from `database.sql` to Prisma/pgvector needs a one-time upgrade path.
- Allowlisting Ollama hosts must still allow `host.docker.internal` and LAN for personal use.
- Full strict TS conversion is large; do after ChatBox split.

## 7. Related docs
- Implementation plan: local only, not in the repository. This spec is the source of truth.
- Prior module specs under `docs/superpowers/specs/`
