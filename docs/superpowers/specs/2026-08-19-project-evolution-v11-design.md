# Project Evolution v11 — Design

**Date:** 2026-08-19  
**Status:** Implemented (P41–P43)  
**Parent:** v10 + XLSX on `master` @ `0e0d048` (P38–P40 implemented; SheetJS RAG/chat attach)  
**Scope:** P41 Code optimization → P42 Reliability → P43 Product polish  
**Mix:** ~50% code quality / ~30% reliability / ~20% polish on **existing** surfaces  
**Horizon:** ~3–4 weeks (one gated wave)  
**Non-goals:** multi-tenant/billing, extra LLM providers, Redis/BullMQ, Postgres inside Electron, auto-publish CI, conversation memory/summary subsystem, RAG re-ranker / RRF rewrite, converting every `export =` route in one PR

---

## 1. Executive summary

**LLM Assistant Studio** is a personal full-stack control panel: Express/Prisma + React/Vite + optional Electron, PostgreSQL/pgvector, OpenAI/Ollama, hybrid RAG (PDF/DOCX/XLSX/TXT/MD), chat UX (SSE, branches, prompts, attachments), Docker Compose.

v9 split god-modules. v10 made citations durable, split the FE API client, and added honest E2E. XLSX landed as text-CSV extraction on the same RAG/attach path.

**v11 is not a feature wave.** It makes the remaining concentrated modules smaller, retrieval scores honest, Docker/deps predictable after npm adds, and a few XLSX/chat finishes that the new format actually needs.

Primary outcomes:
1. **`EmbeddingService` is no longer the RAG god-module** (vector / FTS / retrieve as focused units)
2. **Hybrid fusion scores are comparable** (FTS rank scaled before 0.7/0.3 mix; UI already clamps)
3. **Spreadsheet chunks respect sheet boundaries** (no mid-row 1500-char splits)
4. **Audit baseline + FE CI audit** match post-xlsx `npm audit` reality

---

## 2. Current state (baseline for v11)

### Strengths (carry forward)
- Auth: JWT + refresh cookies, encrypted OpenAI keys, registration gate
- RAG: hybrid vector+FTS, reindex/retry, OpenAI/Ollama embeddings, XLSX→CSV
- Chat: SSE stop, branches, pinned prompts, attachments (incl. xlsx), durable `Message.sources`
- Frontend: React Query + thin `api/` barrel; ChatBox is an orchestrator
- Desktop: tray, updater IPC, `mypersonalllm://` deep links
- Tests: **283** backend Jest, **87** frontend Vitest, ~19 desktop, **6** Playwright E2E
- CI: BE lint/tsc/audit-high/Jest, FE lint/vitest/tsc/build, desktop pack, docker build; nightly E2E
- Docker: migrate + `prisma generate` on start; prod overlay fail-closed secrets

### Residual debt (v11 targets)

| Item | Evidence | User / maintainer impact |
|------|----------|--------------------------|
| `EmbeddingService.ts` ~361 LOC | vector SQL + FTS SQL + recency + fusion orchestration in one file | Every RAG tweak is high-risk |
| Hybrid score math | fusion `0.7 * similarity + 0.3 * ts_rank_cd`; rank unbounded | Citation % can be misleading even after UI clamp |
| XLSX chunking | `chunking.ts` 1500/300 on a CSV blob | RAG splits rows/sheets mid-table |
| CJS dualism | 16 production `export =` (routes, EmbeddingService, providers) | Slows TS cleanup; mixed `require`/`import` |
| JS tests | 6 files under `backend/src/__tests__/*.js` | Inconsistent with TS-first |
| `jspdf` on Dashboard chunk | static import in `useChatExport.ts` | Inflates first chat-route JS |
| Silent RAG miss | `findRelevantChunks` swallows errors → `[]` | Empty RAG looks like “no hits” |
| Stuck `pending` docs | background `documentJobQueue`; no timeout | UI “індексація…” forever |
| Audit drift | baseline 2026-08-17 (BE 4 / FE 3); post-xlsx BE **8** highs in Docker `npm ci` | CI `--audit-level=high` may fail or hide new SheetJS/transitively issues |
| Anonymous `node_modules` | compose volume; `Cannot find module 'xlsx'` after dep add | Dev Docker crash-loop until `--renew-anon-volumes` |
| E2E vs XLSX | `rag-upload` is `.txt` only | Spreadsheet path unguarded |
| Desktop tests | URL/security/deepLinks only | tray/updater/ipc untested |

### Intentionally not in v11
Controllers ~240–268 LOC (conversations/documents/models) — split only if a change already touches them. Full route ESM conversion — later wave.

---

## 3. Phase plan (hard gates)

### Phase P41 — Code optimization (~50%)
**Gate:** `EmbeddingService.ts` is a façade ≤~120 LOC; hybrid fusion unit-tested with normalized ranks; XLSX extract+chunk keeps sheet headers with rows; `useChatExport` does not put jsPDF on the Dashboard critical path; 6 JS tests are `.ts`; no new `export =`.

**Outcomes**
1. **Split RAG retrieve**
   - `services/embeddings/vectorSearch.ts`, `ftsSearch.ts`, `retrieve.ts` (or equivalent)
   - `EmbeddingService` re-exports `findRelevantChunks` / `isAvailable` / `generateBatchEmbeddings`
   - Keep SQL behind the same Prisma `$queryRaw` patterns; no schema change
2. **Normalize fusion**
   - Scale FTS rank to 0..1 per result set (max-rank or sigmoid — pick one, document in `hybridFusion.ts`)
   - Existing `frontend/src/utils/normalizeSimilarity.ts` clamp stays as UI safety net
   - Extend `backend/src/__tests__/hybridFusion.test.ts`
3. **Sheet-aware chunking**
   - If text contains `## Sheet:`, split on those headers first, then `chunkText` per sheet
   - Preserve header line in each chunk so citations can show sheet name later
   - Unit tests in `chunking` / DocumentService
4. **Lazy PDF export**
   - Dynamic `import('jspdf')` inside export handlers; optional `manualChunks` entry if Vite still groups it
   - `useChatExport.test.ts` still passes
5. **TS tests + one service off `export =`**
   - Port `__tests__/*.js` → `.ts` (behavior-identical)
   - Convert `EmbeddingService` (and callers’ `import = require`) to `export default` **or** named exports — not all 8 routers

**Non-goals P41:** changing embedding models, RRF, new extractors (.xls binary).

### Phase P42 — Reliability (~30%)
**Gate:** audit baseline updated and CI policy explicit; RAG failures log `requestId`/doc ids; a pending job older than N minutes is `failed` with reason; E2E uploads an `.xlsx` and sees it in the list; `docker compose` comment or README already documents `--renew-anon-volumes` (done) — verify in a fresh clone note.

**Outcomes**
1. **Security baseline refresh**
   - Re-run `npm audit` BE/FE/desktop; rewrite `docs/security-audit-baseline.md`
   - Decide: keep CI `audit-level=high` with documented exceptions **or** add FE audit job (non-blocking `continue-on-error` if needed)
   - SheetJS `xlsx@0.18.5` community build: document known prototype-pollution class; do not parse untrusted xlsx in a multi-tenant way (this app is personal — still validate magic bytes, already done)
2. **Retrieval errors**
   - `findRelevantChunks`: log error, still return `[]` (don’t crash chat) — but never silent
   - Test: mocked Prisma reject → logger.error called
3. **Indexing watchdog**
   - On `listDocuments` or a small interval in indexing: `pending` + `updatedAt` older than e.g. 10 min → `failed` / “індексація перевищила час”
   - Test with frozen dates or injected clock
4. **E2E xlsx**
   - Playwright: generate tiny xlsx buffer (or fixture) → RAG modal upload → filename visible (mirror `rag-upload.spec.ts`)
5. **Desktop**
   - One unit test file for `ipc` allowlist / payload shape if extractable without Electron; skip GUI

**Non-goals P42:** E2E on every PR, electron-updater auto-publish.

### Phase P43 — Product polish (~20%)
**Gate:** XLSX citations or chunk preview show sheet context; new chats get a title from the first user turn; RAG modal copy lists XLSX consistently (already partly done).

**Outcomes**
1. **Sheet context in RAG UX**
   - Parse leading `## Sheet: Name` from chunk content into `MessageSources` subtitle **or** `filename#Sheet`
   - Keep payload backward compatible (no DB migration required)
2. **Auto-title**
   - After first persisted user message, if title is default/empty, set from first ~40–60 chars of that message (server-side in `persistTurn` or conversation update)
   - Test: persistTurn / sendMessage
3. **Small copy/UX**
   - File-type hint in DocumentModal list (xlsx vs pdf) if cheap
   - Optional preset prompt “Аналітик таблиць” in `PromptLibraryModal` (data/SQL already exists — add spreadsheet-focused one)

**Non-goals P43:** full Excel formula engine, pivot UI, .xls, charts-as-images.

---

## 4. Suggested sequence (dependencies)

```
P41.1 fusion tests → P41.2 retrieve split → P41.3 sheet chunking
P41.4 lazy jspdf (independent)
P41.5 JS→TS tests (independent)
P42 after P41.2 (logging on retrieve)
P43.1 after P41.3 (sheet headers exist in chunks)
P43.2 auto-title independent
```

---

## 5. Success metrics

| Metric | Now | After v11 |
|--------|-----|-----------|
| Largest RAG production module | ~361 LOC EmbeddingService | façade ≤120; pieces ≤150 each |
| BE tests | 283 | 283 + retrieve/chunk/watchdog/xlsx e2e unit |
| FE Dashboard gzip | jsPDF in graph | jsPDF async after export click |
| Docker after `npm install` | crash unless renew volume | documented + optional compose comment |
| Audit doc | 2026-08-17 | 2026-08-19+ post-xlsx |

---

## 6. Risks

- Fusion normalization **changes which chunks win** — lock with fixtures from current `hybridFusion.test.ts` plus new scaled cases; snapshot top-id order on a golden query if possible.
- `xlsx` package advisories — personal app, magic-byte check; do not `eval` sheet formulas.
- Watchdog false-positive on large embeds — set timeout high enough (10–15 min) or skip if `embeddingsCount` mid-flight (status still pending).

---

## 7. Implementation notes for agents

- Style: existing TS, named exports on new files, no new `export =`.
- TDD on fusion, chunking, retrieve error log, auto-title.
- Do not commit `.env`. Plans under `docs/superpowers/plans/` stay gitignored; this spec is the tracked source of truth.
- Docker verify: `up -d --build --force-recreate --renew-anon-volumes` after any backend dependency add.
