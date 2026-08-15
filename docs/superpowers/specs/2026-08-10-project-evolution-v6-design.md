# Project Evolution Roadmap v6 — Design

**Date:** 2026-08-10  
**Status:** Implemented (P18-P22)  
**Parent:** v5 delivered on `master` @ `871adcc` (P15–P17 complete)  
**Scope:** Post-v5 audit → stabilization, product polish, performance, desktop maturity  
**Non-goals:** multi-tenant SaaS, billing, new LLM brands without credentials, Redis/BullMQ unless personal-deploy pain forces it

---

## 1. Executive summary

**LLM Assistant Studio** — personal full-stack control panel: Express/Prisma + React/Vite + optional Electron, PostgreSQL/pgvector, OpenAI/Ollama.

After v5 the project is **production-capable for personal deploy** (Docker, auth, RAG, streaming, desktop shell). Remaining work shifts from security firefighting to **reliability, UX completeness, code hygiene, and measurable performance**.

| Layer | Maturity | Tests (current) |
|-------|----------|-----------------|
| Backend | High — hybrid TS/JS, 31 suites | 215 |
| Frontend | High — mostly TSX, React Query | 44 |
| Desktop | v1 shell — no IPC, external API | 11 (unit) |
| CI | Solid — lint, test, build, docker, electron pack | — |

---

## 2. Architecture (as-is)

```
Browser / Electron
  → /api  (Vite proxy | nginx | Electron uiServer)
  → Express (server.js → dist/ or ts-node bind-mount)
       → Prisma 7 + pgvector + FTS + refresh_tokens + openai_api_key_enc
       → requestId + HS256 JWT + registration gate + rate limits
       → OpenAI / Ollama (honest catalog)
Postgres pgvector:pg15
```

### 2.1 Backend modules

| Area | Files | Notes |
|------|-------|-------|
| Routes/controllers | 7× TS each | Thin HTTP; chat uses `jsonError` |
| Services | 6× TS | ChatService orchestrates RAG + providers |
| Middleware | 3× JS | auth, errorHandler, requestId |
| Utils | 14× TS + multerFilename.js | Security-heavy |
| Bootstrap | server.js, logger.js | JS entry |
| Validators | settingsValidator.js | Dead exports: validateAuthRegister/Login |

### 2.2 Frontend modules

| Area | TS/TSX | JSX remaining |
|------|--------|---------------|
| Pages | Login, Register, Dashboard, Settings | **Profile** |
| Chat | ChatBoxOptimized + 5 chat/*.tsx | **CodeHighlighter** |
| Other | Navigation, ProtectedRoute, ErrorBoundary | **MessageSearch**, **ModelCatalog** |
| Hooks | 7× TS | — |
| Data | React Query + axios api.ts | — |

### 2.3 Database (Prisma)

8 models: User, UserSettings, Conversation, Message, LlmModel, Document, DocumentChunk, RefreshToken.  
4 migrations. Document lifecycle: `pending` → `ready` | `failed`.  
Vector embeddings 1536-dim on DocumentChunk (OpenAI).

### 2.4 Docker

- **Dev:** bind-mount backend, soft secrets, Postgres :5432 published  
- **Prod overlay:** no bind-mount, required JWT/DB/ENCRYPTION_KEY, no host DB port  
- **Known ops footgun:** bind-mount + stale `node_modules/.prisma` → run `prisma generate` in container after schema change; `.gitattributes` enforces LF on `*.sh`

### 2.5 Electron

Functional v1: static UI + `/api` proxy, CSP, nav lock. No IPC/preload API. Requires external backend+DB.

---

## 3. What v5 delivered (baseline)

- Atomic refresh rotation, chat image validation, upload concurrency cap  
- Refresh rate limit, tools lock in ChatService, max_tokens in stream  
- RAG async UX (no pending auto-select, ready/failed toasts)  
- Electron CSP + navigation lock  
- Gravatar MD5, honest provider validators (openai|ollama)  
- requestId on access log, 404, chat errors; partial controller coverage  
- JSX→TSX wave (chat + auth); framer-motion removed  
- post-DNS SSRF in urlAllowlist; RAG similarity string coercion fix  

---

## 4. Residual gaps (ranked)

| Severity | Finding | Evidence |
|----------|---------|----------|
| **High (UX)** | RAG quality depends on valid OpenAI key for embeddings; fallback is first N chunks, not semantic | EmbeddingService, logs `embeddings=0` |
| **High (ops)** | Upload holds full `Buffer` until background finalize | DocumentService.acceptUpload |
| **Med** | Most 500 JSON omit `requestId` outside chatController | auth, settings, users, documents, models, conversations controllers |
| **Med** | 4 JSX source files + 7 backend JS bootstrap/middleware files | Profile, MessageSearch, ModelCatalog, CodeHighlighter |
| **Med** | Dead validator exports never wired | settingsValidator.js validateAuthRegister/Login |
| **Med** | No LICENSE file (README says MIT) | repo root |
| **Med** | Bootstrap CSS global (~250 KB gzip ~35 KB) always loaded | index.tsx |
| **Low** | 11 frontend test files still `.test.jsx` | migration cosmetic |
| **Low** | Desktop: no E2E, empty preload | main.ts, preload.ts |
| **Low** | Vitest peer warnings on Node 20 (jsdom 30 wants 22+) | frontend devDeps |
| **Low** | ModelCatalog `supports_vision` display-only if schema lacks override | v5 spec note |

**No TODO/FIXME/HACK in source** — gaps are architectural, not marked in code.

---

## 5. Goals for v6

| Horizon | Goal |
|---------|------|
| **P18 — Stabilize & observe** | requestId everywhere; upload memory trim; Docker/Prisma ops docs; LICENSE |
| **P19 — RAG product quality** | Honest embedding status in UI; optional local/Ollama embeddings path; chunk preview; re-index failed |
| **P20 — Code hygiene** | Finish JSX→TSX; migrate backend JS shell to TS; remove dead validators; consolidate tests |
| **P21 — Performance** | Bundle analysis + manualChunks; lazy routes already exist — tighten vendor splits; optional Bootstrap subset |
| **P22 — Desktop & E2E** | Preload IPC stub for settings; smoke E2E (Playwright) for auth+chat; optional Windows release CI artifact |

**Non-goals v6:** BullMQ/Redis, multi-user orgs, plugin marketplace, Copilot/Google providers.

---

## 6. Phase P18 — Stabilize & observe

### 18.1 requestId on all error JSON
- Extend `jsonError(res, req, status, message)` usage to: authController, settingsController, usersController, documentsController, modelsController, conversationsController  
- Optional: thin `sendError(res, req, err)` wrapper for catch blocks  
- Tests: one integration per controller group asserting `requestId` on 4xx/5xx  

**Exit:** every API error body includes `requestId` matching `X-Request-Id`.

### 18.2 Upload memory hygiene
- After `acceptUpload` enqueues job, drop reference to `buffer` (pass slice or write temp file under `uploads/` with cleanup)  
- Env: `UPLOAD_TEMP_DIR`, max retain time  
- Test: mock shows buffer not retained after enqueue returns  

**Exit:** concurrent large uploads don't multiply RSS linearly with file size.

### 18.3 Ops documentation
- README section: Docker dev pitfalls (CRLF entrypoint, prisma generate in container, RAG needs OpenAI key)  
- `.env.example` comments for `DOCUMENT_JOB_CONCURRENCY`, `ALLOW_REGISTRATION`  

### 18.4 LICENSE
- Add MIT LICENSE file matching README  

**Exit P18:** observable errors, safer uploads, legal clarity, ops runbook.

---

## 7. Phase P19 — RAG product quality

### 19.1 Embedding status in UI
- Settings/DocumentModal: badge when `has_openai_api_key` false → "RAG: fallback (без embeddings)"  
- Toast on upload success if embeddings=0  

### 19.2 Failed document recovery
- DocumentModal: show server `error` if stored (may need schema field `failure_reason` optional)  
- Button "Повторити індексація" → re-queue finalize for failed docs  

### 19.3 Chunk preview (debug UX)
- Document detail drawer: list first 3 chunks text (paginated API `GET /documents/:id/chunks?limit=5`)  
- Helps user verify ingest without pgAdmin  

### 19.4 Optional: Ollama embeddings
- If `default_provider=ollama` and host supports `/api/embeddings`, use for ingest + query (feature-flag env)  
- Fallback chain: OpenAI → Ollama embed → lexical fallback  

**Exit P19:** user understands RAG quality; can recover failed docs; optional local embed path.

---

## 8. Phase P20 — Code hygiene

### 20.1 Frontend JSX → TSX (4 files)
- `Profile.jsx` → `Profile.tsx` (gravatar already TS util)  
- `MessageSearch.jsx`, `ModelCatalog.jsx`, `CodeHighlighter.jsx`  

### 20.2 Backend JS → TS (incremental)
- `requestId.js`, `errorHandler.js`, `auth.js` → `.ts` (Express types)  
- `server.js` last (or keep JS bootstrap with TS imports)  
- `settingsValidator.js`: delete dead exports; split auth validators to `authValidator.ts` if needed  

### 20.3 Test consolidation
- Move `backend/tests/utils/multerFilename.test.js` → `src/__tests__/`  
- Convert high-value `.test.jsx` → `.test.tsx` (Login, Dashboard done; Register, Profile next)  

### 20.4 API surface cleanup
- Audit unused routes vs frontend api.ts (getById already removed)  
- OpenAPI stub optional (low priority)  

**Exit P20:** strict TS on touched surfaces; no dead exports; consistent test layout.

---

## 9. Phase P21 — Performance

### 21.1 Bundle analysis
- `vite build --mode analyze` or rollup-plugin-visualizer  
- Target chunks: react-syntax-highlighter (already lazy), api axios, dashboard route  

### 21.2 manualChunks (if analysis shows win)
```ts
// vite.config.js — example
manualChunks: {
  vendor: ['react', 'react-dom', 'react-router-dom'],
  query: ['@tanstack/react-query'],
  markdown: ['react-markdown'],
}
```

### 21.3 Bootstrap trim (optional)
- Replace global bootstrap.min.css with SCSS imports of used modules only, OR  
- Keep bootstrap but document tradeoff (acceptable for personal app)  

### 21.4 Backend
- Embedding column probe cache already exists  
- Consider connection pool tuning in prisma/pg adapter for Docker  

**Exit P21:** documented bundle budget; optional 10–20% initial JS reduction if low effort.

---

## 10. Phase P22 — Desktop & E2E

### 22.1 Preload IPC (minimal)
- `preload.ts`: expose `window.electron.getBackendUrl()`, `openExternal(url)`  
- Main validates channels  

### 22.2 Playwright smoke (CI optional job)
- Register → login → send chat message (mock Ollama or skip stream assert)  
- Run against `docker compose up` stack in CI (heavy — nightly only)  

### 22.3 Windows release artifact
- GH Actions: `electron-builder --win` on `windows-latest`, upload artifact (no auto-publish)  

**Exit P22:** desktop has minimal secure IPC; regression net for critical path.

---

## 11. Suggested execution order

```
P18 (stabilize) → P19 (RAG UX) → P20 (hygiene) → P21 (perf) → P22 (desktop/E2E)
```

Within each phase: TDD for behavior changes; commit per task; push when asked.

| Priority | Task | Effort |
|----------|------|--------|
| **Now** | P18.1 requestId all controllers | S |
| **Now** | P18.4 LICENSE | XS |
| **Now** | P19.1 embedding status UI | S |
| **Next** | P18.2 upload memory | M |
| **Next** | P20.1 remaining JSX→TSX | S |
| **Later** | P19.3 chunk preview API | M |
| **Later** | P21 bundle analysis | S |
| **Optional** | P19.4 Ollama embeddings | L |
| **Optional** | P22 Playwright CI | L |

---

## 12. Verification commands

```bash
cd backend && npm test && npm run lint
cd frontend && npm test && npm run lint && npx tsc --noEmit
cd desktop && npm test
docker compose up -d --build   # manual smoke
```

Coverage floors (backend): statements/lines/functions 80%, branches 60%.

---

## 13. Risk register

| Risk | Mitigation |
|------|------------|
| OpenAI key missing → weak RAG | UI honesty + docs; optional Ollama embed |
| Docker bind-mount stale Prisma client | Document `prisma generate` in container; prod overlay avoids |
| Large PDF upload OOM | P18.2 temp file + concurrency cap (existing) |
| Electron scope creep | Keep IPC minimal; no bundled DB in v6 |

---

## 14. Related docs

- v5 spec: `docs/superpowers/specs/2026-08-09-project-evolution-v5-design.md`  
- v4: `2026-08-08-project-evolution-v4-design.md`  
- Implementation plan (after approval): `docs/superpowers/plans/2026-08-10-project-evolution-v6.md`
