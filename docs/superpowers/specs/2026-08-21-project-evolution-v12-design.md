# Project Evolution v12 — Design

**Date:** 2026-08-21  
**Status:** Implemented (P44–P46)  
**Parent:** v11 Implemented (P41–P43) on `master` @ `b31aebf`  
**Scope:** P44 Module hygiene → P45 Thin boundaries + FE DRY → P46 Reliability  
**Mix:** ~70% code quality / ~30% reliability on **existing** surfaces  
**Horizon:** ~3–4 weeks (one gated wave)  
**Approach:** Three hard-gated phases (same cadence as v10/v11)

**Non-goals:** multi-tenant/billing, extra LLM providers, Redis/BullMQ, conversation memory/summary, RAG RRF/re-ranker, Electron GUI E2E, full FE modal rewrite “for aesthetics”, Postgres inside Electron, auto-publish CI

---

## 1. Executive summary

**LLM Assistant Studio** is a personal full-stack control panel: Express/Prisma + React/Vite + optional Electron, PostgreSQL/pgvector, OpenAI/Ollama, hybrid RAG (PDF/DOCX/XLSX/TXT/MD), chat UX (SSE, branches, prompts, attachments), Docker Compose.

v9–v11 split god-modules, durable citations, SheetJS RAG, retrieve façade, indexing watchdog, and honest audit baseline.

**v12 is a hygiene + reliability wave.** It finishes the CJS/`export =` cleanup on the BE HTTP edge, removes Prisma/FTS schema drift, thins controllers that still own too much logic, unifies FE 401→refresh for axios and SSE fetch, and makes RAG miss vs retrieve error and post-restart indexing status honest for the user.

Primary outcomes:
1. **Production BE edge is ESM-clean** (routes, middleware, server, openai/ollama/providerFactory — no `export =`)
2. **FTS column is visible in Prisma schema** (`content_tsv` no longer migration-only drift)
3. **Touched controllers stay thin** (HTTP + validation; work in services)
4. **One shared FE refresh path** for axios interceptors and chat SSE `fetch`
5. **Reliability signals:** RAG status distinguishable in UI; pending jobs after process death do not look like healthy indexing forever

---

## 2. Current state (baseline for v12)

### Strengths (carry forward)
- Auth: JWT access (memory) + httpOnly refresh rotate; AES-GCM per-user OpenAI keys; registration gate
- RAG: hybrid vector+FTS with normalized fusion; sheet-aware chunks; durable `Message.sources`; indexing watchdog
- Chat: SSE stop, branches, prompts, attachments, auto-title on placeholder chats
- Frontend: React Query + split `api/` modules; ChatBox as hook orchestrator; lazy routes + manualChunks
- Desktop: sandbox, CSP, IPC allowlist + unit tests, deep links, tray/updater
- Tests: BE Jest ~80% threshold (~43 suites), FE Vitest (~32 files), desktop node:test, Playwright smoke (7 specs)
- CI: BE/FE/desktop + docker build; nightly/manual E2E; audit policy documented

### Residual debt (v12 targets)

| Item | Evidence | Impact |
|------|----------|--------|
| CJS dualism | ~15 production `export =` (8 routes, 3 middleware, server, openai/ollama/providerFactory); `compression.d.ts` stays ambient | Mixed require/import; slower TS cleanup |
| Schema drift | `content_tsv` in FTS migration, absent from `schema.prisma` | Agents/tools miss FTS; drift risk |
| Thick controllers | conversations/documents/models/chat ~220–250 LOC | Hard to change safely; logic not reusable |
| Dup multer | `routes/chat.ts` + `routes/documents.ts` | Divergent upload rules |
| Dup 401 refresh | axios interceptor vs `api/chat.ts` fetch stream | Session bugs diverge; double refresh races |
| FE leftover `.js` tests | `catalogModelOptions.test.js`, `listPagination.test.js` | Inconsistent with TS-first |
| In-process queue | `documentJobQueue` dies on restart | Staging may remain; UI “pending” until watchdog |
| Silent-ish RAG | retrieve logs + returns `[]`; UI looks like “no hits” | User cannot tell miss vs error |
| E2E depth | upload list only; no citation assertion / stream+stop | Regressions in core UX unguarded |
| Hot FE files | PromptLibrary/DocumentModal/ModelCatalog/ChatBox/useChatStream ~300+ LOC | Out of scope unless a task already touches them |

### Intentionally not in v12
- Splitting every FE modal “because large”
- Redis/BullMQ job backend
- Memory/summary subsystem
- Converting third-party ambient `export =` typings beyond necessity

---

## 3. Phase plan (hard gates)

### Phase P44 — Backend module hygiene (~35%)

**Gate:** `cd backend && npx tsc --noEmit && npm test` green; **zero** production `export =` in `src/routes/`, `src/middleware/`, `src/server.ts`, `src/services/openaiService.ts`, `src/services/ollamaService.ts`, `src/services/providerFactory.ts` (ambient `types/compression.d.ts` allowed); `content_tsv` documented in `schema.prisma`; shared upload middleware used by chat + documents routes.

**Outcomes**
1. **ESM conversion (HTTP edge + providers)**
   - Change `export = X` → `export default X` (or named exports where already idiomatic)
   - Update all `import = require` / `require()` callers in src + tests
   - Keep Jest working (`__esModule` / default mocks as needed)
2. **Prisma FTS visibility**
   - Add `contentTsv` (or equivalent map) on `DocumentChunk` as `Unsupported("tsvector")` **or** documented `@ignore` strategy if Prisma cannot model it cleanly — prefer `Unsupported` + `@@map` so schema matches migration
   - **No new migration** if column already exists in DB
3. **Shared multer helper**
   - Extract one `createDocumentUpload()` (limits, magic filter) used by documents + chat attachment routes

**Non-goals P44:** thinning controllers; FE changes; Redis.

---

### Phase P45 — Thin boundaries + FE DRY (~35%)

**Gate:** At least `chatController`, `documentsController`, `conversationsController`, `modelsController` reduced to ~≤180 LOC **or** clearly split into controller + `*Service` methods with no duplicated Prisma CRUD in the controller; FE axios + SSE stream share one single-flight `refreshAccessToken()`; leftover FE `*.test.js` for catalog/listPagination ported to `.ts`.

**Outcomes**
1. **Thin controllers**
   - Move list/create/update/delete/export bodies into existing or new service modules under `services/`
   - Controllers: parse → call service → map status/JSON
   - Prefer extending `DocumentService` / chat ownership helpers over new god-files
2. **Shared FE auth refresh**
   - New module e.g. `frontend/src/services/api/authRefresh.ts`: single-flight queue, set token, logout path
   - Wire axios interceptor + `chat.ts` stream `fetch` to it
   - Unit tests: concurrent 401 → one refresh; fail → clear + redirect behavior mocked
3. **FE test TS port**
   - `catalogModelOptions.test.js` → `.ts`; `listPagination.test.js` → `.ts`

**Non-goals P45:** rewriting ChatBoxOptimized; Profile→React Query unless trivial while touching auth.

**Optional if already editing:** extract a small piece of `indexing.ts` only when the change set already requires it — not a P45 goal by itself.

---

### Phase P46 — Reliability (~30%)

**Gate:** Client can distinguish RAG `ok` / `empty` / `error` (SSE field or final payload + UI cue); process restart leaves no permanent healthy-looking stale `pending` without watchdog/requeue path covered by test; at least one deeper E2E (`rag` shows sources **or** stream+stop); audit baseline date bumped if lockfiles/deps change.

**Outcomes**
1. **RAG status signal**
   - Backend: pack retrieve result with status (`ok` | `empty` | `error`) into chat prepare/stream metadata (backward compatible: omit = treat as legacy)
   - Frontend: soft badge/toast — do not fail the whole chat on `error`
2. **Queue / restart honesty**
   - On server boot (or first documents list): ensure stale pending → failed (existing watchdog) **and** optionally one-shot requeue if `stagingPath` still exists and age &lt; N
   - Document behavior in README one-liner if UX-visible
3. **E2E depth**
   - Prefer: upload fixture → ask question with doc selected → assert citation/source UI **or** assert stream tokens + Stop aborts
   - Keep personal-app tolerance for missing OpenAI key (skip/soft-assert as existing smoke)
4. **Audit**
   - Re-run BE/FE/desktop audit; update `docs/security-audit-baseline.md` if numbers move

**Non-goals P46:** Electron Playwright project; forcing Redis; changing fusion weights.

---

## 4. Suggested sequence (dependencies)

```
P44.1 route/middleware/server ESM
P44.2 openai/ollama/providerFactory ESM (+ mocks)
P44.3 schema content_tsv visibility
P44.4 shared multer (can parallel P44.3)

P45.1 shared FE authRefresh (+ tests) — independent of controllers
P45.2 thin documents + chat controllers (after P44 stable)
P45.3 thin conversations + models
P45.4 FE .js test ports (independent)

P46.1 RAG status plumbing (BE then FE)
P46.2 boot/list requeue or fail-stale confirmation tests
P46.3 E2E depth
P46.4 audit baseline if needed
```

---

## 5. Success metrics

| Metric | Now (post-v11) | After v12 |
|--------|----------------|-----------|
| Production `export =` (excl. ambient d.ts) | ~15 | 0 in listed targets |
| `content_tsv` in Prisma schema | missing | present / explicitly modeled |
| Largest touched controllers | ~220–250 LOC | ≤~180 or logic in services |
| FE 401 refresh implementations | 2 divergent | 1 shared single-flight |
| RAG miss vs error in UI | indistinguishable | distinct soft signal |
| E2E | upload/list + smoke | + citations **or** stream+stop |
| BE coverage thresholds | 80/80/80/60 | unchanged |

---

## 6. Risks

| Risk | Mitigation |
|------|------------|
| ESM breaks Jest mocks / default imports | Convert callers with producers; keep `__esModule: true` patterns already used for EmbeddingService |
| Prisma `Unsupported("tsvector")` quirks | No migration if column exists; verify `prisma generate` + migrate deploy dry-run |
| Controller “half-split” leaves worse structure | Gate by LOC **or** zero Prisma in controller body — pick explicit checklist per PR |
| RAG status field breaks old clients | Additive optional field; FE treats missing as legacy |
| Requeue after restart double-processes | Only requeue `pending` with staging file present and not already active in queue |

---

## 7. Error handling & testing (cross-cutting)

- Retrieve failures: keep returning empty chunks for LLM safety; **add** status `error` + existing logger with `requestId` / doc ids
- Chat must still complete on RAG error
- TDD required for: authRefresh single-flight, RAG status mapping, any requeue/boot hook, controller service extraction smoke
- Do not lower Jest coverage thresholds
- Docker: after BE dependency add, `--renew-anon-volumes` as already documented

---

## 8. Implementation notes for agents

- Style: existing TS; **no new `export =`**; prefer `export default` for Express routers/middleware parity with current call sites
- TDD on behavior changes; commit small per phase gate
- Do not commit `.env` or `docs/superpowers/plans/`
- This spec is the tracked source of truth for v12; implementation plans are local/gitignored
- Verify: `backend` tsc+jest, `frontend` vitest+tsc, `desktop` npm test, optional docker compose health

---

## 9. Approval record

- Focus: **A** (~70% quality / ~30% reliability) — user 2026-08-21  
- Approach: **1** (three gated phases) — user 2026-08-21  
- Sections 1–3 design — user OK 2026-08-21  
