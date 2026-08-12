# Project Evolution v8 — Design

**Date:** 2026-08-12  
**Status:** Draft for review  
**Parent:** v7 code delivered on `master` @ `4b79cca` (P24–P30 implemented without a v7 design doc)  
**Scope:** v8 quality base (P31) → RAG MVP+ (P32) → Chat UX (P33) → Desktop shell deepening (P34)  
**Non-goals:** multi-tenant orgs/billing, additional LLM embedding/chat providers beyond OpenAI+Ollama, distributed queues (Redis/BullMQ) unless personal-deploy pain forces it, bundling DB inside Electron

---

## 1. Executive summary

**LLM Assistant Studio** is a personal full-stack control panel: Express/Prisma + React/Vite + optional Electron, PostgreSQL/pgvector, OpenAI/Ollama, with document ingestion and semantic RAG.

By code, P24–P30 (including Ollama embeddings, reindexing endpoints, and multiple reliability hardening items) are present on `master`. v8 focuses on making the project easier to evolve and harder to break by addressing:

1. **Reliability & code hygiene** (P31)
2. **Better retrieval quality** (P32) via hybrid + tuned chunking and polished reindexing
3. **Chat UX completeness** (P33) with saved/pinned prompts, answer branches/regenerate, and file attachments in chat
4. **Desktop UX depth** (P34) with updater feedback + tray/deep links + native notifications

---

## 2. Phase plan (with hard gates)

### Phase P31 — Quality foundation (≈70%)
**Gate:** all acceptance checks pass (tests, typecheck, CI essentials, docs/spec index consistency). No P32 begins before this.

**Outcomes**
- Specs index is consistent (v6/v7/v8 statuses match repo reality)
- Critical modules are split to reduce risk:
  - `backend/src/services/DocumentService.ts` → focused services/modules
  - `frontend/src/pages/Settings.tsx` → section components under `frontend/src/components/settings/*`
- Bootstrap/boot entrypoints are moved from JS to TS (server bootstrap reliability)
- CI uses a vector-capable Postgres image (pgvector) or explicitly documents why vector tests are mock-only
- Observability consistency: `requestId` is present in all JSON error responses for auth-related flows
- Frontend tests cover at least:
  - `Register`, `Profile`, `ConfirmModal`, and one RAG UX smoke path

### Phase P32 — RAG MVP+ (hybrid + tuned chunking)
**Gate:** a measurable improvement in retrieval quality for “keyword-heavy queries” while keeping latency reasonable and not breaking existing semantic RAG flows.

**Outcomes**
- Retrieval uses **hybrid search**:
  - vector similarity (existing pgvector path)
  - keyword/FTS (existing/added FTS path on `document_chunks.content`)
  - rank fusion (weighted score or RRF) with deterministic limits
- Chunking becomes tunable:
  - `chunkSize` / `overlap` defaults match current behavior (~1500/300)
  - reindex UX reflects when chunking parameters or provider changed

### Phase P33 — Chat UX (pinned prompts, branches, attachments)
**Gate:** UX paths are stable (no broken streaming, branches don’t break chat history loading, export still works).

**Outcomes**
- Saved/pinned prompts:
  - presets remain, user can pin/unpin prompts
  - prompt selection affects model/system prompt building
- Answer branches/regenerate:
  - regenerate creates a sibling branch from the selected user message (or chosen assistant message)
  - UI can switch between versions without breaking streaming
- File attachments in chat:
  - accept `.txt/.md/.pdf` (and extracted text) plus optional image support as today
  - attachments are converted into ephemeral “context blocks” (not permanently stored as documents unless user chooses)

### Phase P34 — Desktop shell deepening (updater + tray + deep links + notifications)
**Gate:** deep links reliably navigate to the correct conversation view; updater checks don’t break the shell.

**Outcomes**
- Updater UX:
  - “Check updates” and “update available/downloaded” banners
  - release notes surfaced in the app
- Tray:
  - open app, open settings, check updates
- Deep links:
  - `mypersonalllm://chat/<conversationId>`
  - app start → route to conversation once ready
- Native notifications:
  - update notifications and “new message” notifications (when applicable)

---

## 3. Architecture (what changes in v8)

### 3.1 RAG hybrid retrieval (P32)

**Current baseline**
- `backend/src/services/EmbeddingService.ts` returns “relevant chunks” via embedding similarity and SQL over `document_chunks.embedding`.
- Document ingestion stores chunks and embeddings, with `Document.embedding_provider` and `DocumentChunk.embedding` as `vector(768)`.

**Proposed v8 retrieval**
- Extend `EmbeddingService.findRelevantChunks(...)` into two independent sub-queries:
  1. **Vector query**: pgvector cosine similarity on `document_chunks.embedding`
  2. **FTS query**: keyword ranking on `document_chunks.content` using the project’s existing FTS approach (`messageFts`-like)
- Fuse results:
  - deterministic rank fusion:
    - option A (recommended): Weighted score fusion: `score = α * vectorScore + β * ftsScore`
    - option B: RRF (reciprocal rank fusion) if score scales are unstable
- Return a single list of chunks for downstream `ChatService` context building.

**Failure handling rules**
- If embeddings are unavailable for the user/provider:
  - retrieval falls back to FTS-only, but must still return stable chunk limits
- SSRF/security protections already exist for embedding providers; hybrid search must not introduce new network paths.

### 3.2 Code splitting (P31)

**DocumentService**
- Introduce internal boundaries (modules or new service files) so that each unit is testable:
  - upload/temp handling
  - extraction + normalization
  - chunking (parameterized)
  - embedding (delegated to `EmbeddingService`)
  - transactionally updating `Document` and `DocumentChunk`
  - retry/reindex workflows

**Settings**
- Break `Settings.tsx` into smaller components:
  - provider selection
  - RAG mode / system prompt
  - model parameter controls

### 3.3 Observability and error consistency (P31)
- Ensure auth failures and other JSON errors include `requestId`.
- Keep existing `jsonError(...)` and `errorHandler` as the canonical path.

---

## 4. Data model changes (planned)

### 4.1 P32: chunking parameters and hybrid readiness

To ensure reindex is correct after tuning chunking:
- Add fields (exact naming to be finalized in implementation plan) to either:
  - `documents` (`chunk_size`, `chunk_overlap`, `rag_embedding_mode_snapshot`, etc.), or
  - a dedicated `document_ingestion_params` JSON column.

Minimum requirement:
- When `chunkSize/chunkOverlap` defaults change between releases, documents that were ingested with old parameters should set `needs_reindex = true`.

### 4.2 P33: message branches + attachments

To support answer branching:
- Extend `backend/prisma/schema.prisma`:
  - add `parentId`/`branchId` semantics to `Message`
  - ensure queries in conversation history fetch the active branch (latest) by default

To support chat attachments:
- Attachments can be ephemeral in chat state initially:
  - store extracted text as transient context blocks during the request
  - only persist as a `Document` if the user triggers “save as document”

---

## 5. API & UI requirements

### 5.1 P32 (RAG)
- Keep existing endpoints:
  - `POST /api/documents/:id/reindex`
  - `POST /api/documents/:id/retry`
  - `GET /api/documents/:id` and `GET /api/documents/:id/chunks`
- Add (if needed) a GET for ingestion params or include them in document record so UI can explain “why reindex is needed”.

UI:
- `DocumentModal` badge and “Переіндексувати” must accurately reflect:
  - provider mismatch
  - chunking parameter mismatch

### 5.2 P33 (Chat UX)
- Pinned prompt management:
  - CRUD endpoint(s) for saved prompts (or extend user settings if kept simple)
  - UI wiring inside `PromptLibraryModal` and chat system prompt builder
- Branch/regenerate:
  - new endpoint or extend existing chat send to accept “regenerate from messageId”
  - UI must be able to load correct branch history
- Chat attachments:
  - upload endpoint(s) with validation (mimetype + size)
  - extraction path reuses the document pipeline where possible

### 5.3 P34 (Desktop)
- No server API changes required unless deep links are implemented with additional routes:
  - deep link handler routes locally to the same frontend route that renders chat
- Updater/tray only affects Electron main/UI.

---

## 6. Testing strategy

### P31
- Backend:
  - Jest tests continue passing (existing suites remain)
  - new tests for split modules (DocumentService extraction/chunking/embed workflow boundaries)
- Frontend:
  - add tests for:
    - `Register` happy path + validation
    - `Profile` rendering with mocked user fetch
    - `ConfirmModal` confirm/cancel behavior
    - one smoke path for RAG reindex button in `DocumentModal`
- CI:
  - typecheck + unit tests must pass
  - audit step must be configured so high/critical doesn’t silently pass

### P32
- Unit tests for hybrid fusion:
  - deterministic rank fusion logic with fixed input scores
- Integration-ish tests with mocks:
  - embeddings present → vector+FTS results fused
  - embeddings absent → FTS-only returns non-empty results when keywords match

### P33
- Tests for:
  - pinned prompt CRUD + prompt selection updates built system prompt
  - regenerate creates sibling branch + history switching loads the correct branch
  - attachment validation rejects unsupported mime types

### P34
- Desktop unit tests (where available) for deep link routing and tray action handlers
- Manual verification checklist for updater:
  - update available
  - update downloaded banner
  - restart-on-install flow

---

## 7. Acceptance criteria (v8)

1. Docs/spec index is consistent: v6/v7/v8 statuses match repository state.
2. `npm test` (backend) + frontend test suite + `tsc --noEmit` pass.
3. CI runs with vector-capable Postgres or explicitly documents why vector behavior is mocked.
4. RAG retrieval:
   - hybrid retrieval returns relevant chunks for keyword-heavy queries
   - fallback is correct when embeddings are unavailable
5. Chat UX:
   - pinned prompts are usable
   - regenerate/branches work without breaking SSE streaming and history rendering
6. Desktop:
   - deep link opens correct conversation
   - updater/tray/natively displayed notifications work on at least one test platform.

---

## 8. Implementation decomposition (what will become plans)

This design intentionally maps to task plans:
- Plan for **P31 Quality** (docs, splits, TS bootstrap, CI, tests)
- Plan for **P32 RAG MVP+** (hybrid query + fusion + chunk params + reindex UI copy)
- Plan for **P33 Chat UX** (pinned prompts, branches, attachments)
- Plan for **P34 Desktop** (updater + tray + deep links + notifications)

