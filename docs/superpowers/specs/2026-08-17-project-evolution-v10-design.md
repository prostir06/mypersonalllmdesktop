# Project Evolution v10 — Design

**Date:** 2026-08-17  
**Status:** Implemented  
**Parent:** v9 delivered on `master` @ `18c622c` (P35–P37 implemented)  
**Scope:** P38 Durable artifacts → P39 Module hygiene → P40 Reliability polish  
**Mix:** ~70% quality/reliability / ~30% product polish on **existing** features (close v9 residuals)  
**Horizon:** ~3–4 weeks (one gated wave)  
**Non-goals:** multi-tenant/billing, extra LLM providers, Redis/BullMQ queues, bundled Postgres in Electron, auto-publish CI, conversation memory/summary subsystem, RAG re-ranker / RRF rewrite, full CJS→ESM conversion of every route in one PR

---

## 1. Executive summary

**LLM Assistant Studio** is a personal full-stack control panel: Express/Prisma + React/Vite + optional Electron, PostgreSQL/pgvector, OpenAI/Ollama, hybrid RAG, chat UX (branches, prompts, attachments), and desktop shell (tray, updater, deep links).

v9 reduced god-module risk and made Docker/E2E honest. **v10 closes the gap between “shipped MVP polish” and “reliable daily driver”** without opening a new feature wave.

Primary user-visible fixes:
1. **RAG citations survive reload** (persisted on assistant messages, returned in history)
2. **PDF export matches Markdown export quality** (full conversation, readable Ukrainian text)
3. **Codebase hygiene** on the next hotspots (`api.ts`, leftover JS, hybrid score display)

---

## 2. Current state (baseline for v10)

### Strengths (carry forward)
- Auth: JWT + refresh cookies, encrypted OpenAI keys, registration gate
- RAG: hybrid vector+FTS fusion, reindex/retry, Ollama/OpenAI embeddings
- Chat: SSE stream/stop, branches/regenerate, pinned prompts, attachments
- Desktop: tray, updater IPC, `mypersonalllm://` deep links
- Tests: ~272 backend Jest, ~70 frontend Vitest, ~19 desktop, 4 Playwright E2E
- CI: lint/tsc/audit, Jest+pgvector, FE build, desktop pack, docker build; nightly E2E

### Residual debt (v10 targets)
| Item | Evidence | User impact |
|------|----------|-------------|
| Citations ephemeral | `sources[]` on live `/send` + SSE `done` only; `Message` schema has no field; `history.ts` omits sources | “Джерела” disappear after refresh |
| PDF export partial / unreadable UA | `exportPdf` uses in-memory `messages`; jsPDF default font; MD export uses backend `/export` | Saved chats export incomplete PDF; Cyrillic broken |
| `api.ts` monolith | ~338 LOC single client | Hard to test/maintain |
| CJS dualism | ~20 `export =` modules (routes, services) | Slows TS cleanup |
| JS leftovers | `logger.js`, `multerFilename.js` | Inconsistent with TS-first boot |
| Hybrid score UI | Fused score shown as `similarity * 100` | Can exceed 100% |
| E2E thin vs v9 AC | 4 specs; no dedicated stream/settings smoke | Regressions slip past nightly |
| Audit highs (pre-existing) | BE transitive highs; desktop `tar` via electron-builder | AC8 policy needs explicit baseline |

---

## 3. Phase plan (hard gates)

### Phase P38 — Durable chat artifacts (~40%)
**Gate:** reload conversation still shows `Джерела` for RAG-backed assistant turns; PDF of saved chat includes all messages with readable Ukrainian body text; citation % never exceeds 100.

**Outcomes**
1. **Persist RAG sources**
   - Prisma: optional `sources Json?` on `Message` (assistant rows only)
   - `persistTurn` accepts `sources?: RagSource[]` and stores on assistant create
   - `getHistory` / branch mapping includes `sources` on assistant messages
   - Regenerate path: new assistant branch gets its own sources snapshot
   - Additive API — no breaking field removals
2. **PDF export parity**
   - Saved conversations: fetch full export payload (reuse `conversationAPI.export('md')` or dedicated history fetch) before PDF generation
   - Embed Unicode-capable font in jsPDF (e.g. bundled Noto Sans subset or documented font file under `frontend/public/fonts/`)
   - Unsaved local-only chats: keep current in-memory path
3. **Score normalization**
   - Clamp/normalize fused hybrid score to 0..1 before UI (`MessageSources` or shared helper)

**Non-goals P38:** backend PDF generation, changing RAG retrieval algorithm.

### Phase P39 — Module hygiene (~35%)
**Gate:** `frontend/src/services/api.ts` is a thin barrel; domain clients live in focused modules; `logger` and `multerFilename` are TypeScript; no new `export =` in touched files; all tests green.

**Outcomes**
1. **Split FE API client**
   - Create `frontend/src/services/api/` modules: `client.ts` (axios + refresh), `auth.ts`, `chat.ts`, `conversations.ts`, `documents.ts`, `models.ts`, `settings.ts`, `prompts.ts`
   - `api.ts` re-exports public surface (preserve import paths for app code)
2. **Backend JS → TS (minimal)**
   - `logger.js` → `logger.ts` (Winston config unchanged behavior)
   - `multerFilename.js` → `multerFilename.ts`
3. **Named exports on touched backend files**
   - Convert `ChatService`, `DocumentService`, `auth` middleware, and edited routes to `export` / `export default` — only files modified in v10
   - Do **not** batch-convert every remaining `export =` route in one PR
4. **Optional if still >300 LOC after P38:** extract pure helpers from `EmbeddingService.ts` into `services/embeddings/` (only if a clear seam exists without behavior change)

**Non-goals P39:** rewriting all routes/controllers, Electron changes.

### Phase P40 — Reliability polish (~25%)
**Gate:** E2E suite ≥6 scenarios green; targeted FE tests for PromptLibrary + PDF/sources reload; audit baseline documented; CI green.

**Outcomes**
1. **E2E expansion**
   - Stream happy path: send message → assistant appears (mock or deterministic provider if needed)
   - Settings smoke: save system prompt field without live OpenAI
   - Optional: export button smoke (MD download triggered)
2. **Frontend tests**
   - History reload renders `MessageSources` when API returns `sources`
   - PDF export for saved conversation uses backend export path (mock)
   - PromptLibraryModal: pin/unpin or apply prompt smoke
3. **Audit policy**
   - Document pre-existing high/critical advisories in README or `docs/` security note
   - No new high/critical from v10 deps (`jspdf` already patched in v9)
   - Bump safe transitive fixes where `npm audit fix` is non-breaking

**Non-goals P40:** PR-blocking full E2E on every push (keep nightly).

---

## 4. Architecture (what changes)

### 4.1 Data model (P38)

```
Message
  … existing fields …
  sources Json?   // [{ filename, similarity? }] — assistant only
```

Migration: additive nullable column; backfill not required (old messages simply lack sources).

### 4.2 Chat persist flow (P38)

```
prepareMessages → sources from buildSystemContext
  → ProviderFactory send/stream
  → persistTurn(..., { sources })
  → getHistory includes sources on assistant rows
  → FE MessageItem → MessageSources (unchanged component)
```

### 4.3 PDF flow (P38)

```
exportPdf:
  if conversationId → conversationAPI.export('md') → parse/build PDF with Unicode font
  else → buildPdfFromMessages(local messages)
```

### 4.4 FE API layout (P39)

```
frontend/src/services/
  api.ts              // barrel re-exports
  api/client.ts       // axios instance, interceptors, refresh queue
  api/chat.ts         // send, stream, search, attachments
  api/conversations.ts
  api/documents.ts
  …
  sseParse.ts         // unchanged location
  authToken.ts
```

---

## 5. Testing strategy

| Phase | Automated | Manual |
|-------|-----------|--------|
| P38 | Jest: persistTurn stores sources; history returns sources; FE: history+PDF tests | Reload dashboard → citations visible; UA PDF readable |
| P39 | Existing suites; api module split tests follow existing `api.test.ts` patterns | Smoke login/chat after import path check |
| P40 | +2 E2E specs; PromptLibrary test | Nightly E2E green on Compose |

---

## 6. Acceptance criteria (v10)

1. Assistant messages with RAG sources show `Джерела` after page reload and conversation re-select.
2. PDF export of a **saved** conversation includes the same message set as Markdown export (not just currently loaded page).
3. Ukrainian/Cyrillic text in PDF body is readable (not tofu boxes).
4. Citation relevance display is 0–100% (never >100%).
5. `frontend/src/services/api.ts` is ≤80 LOC barrel; domain clients extracted.
6. No runtime `.js` files remain under `backend/src/` except test/config if any.
7. Touched backend modules use named exports (no new `export =`).
8. E2E: login, register/smoke, RAG upload, conversation query, **stream**, **settings** — all pass nightly.
9. Backend Jest + frontend Vitest + desktop tests + typechecks pass; v10 introduces no new high/critical audit findings (document pre-existing).

---

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Json column size for large source lists | Cap sources count at existing RAG pack limit; store same array as live response |
| Font file increases FE bundle | Subset font or woff2 only for PDF path (dynamic import) |
| api.ts split breaks imports | Keep barrel `api.ts`; run full FE test suite |
| E2E flakiness on live LLM | Use settings-only and deterministic mocks; skip provider call where possible |
| Partial ESM migration breaks Jest | Convert only touched files; run backend tests after each |

---

## 8. Approach options (locked: **A**)

| Option | Description | Verdict |
|--------|-------------|---------|
| **A — Close v9 residuals (chosen)** | P38 artifacts → P39 hygiene → P40 reliability | **Selected** |
| B — New product slice | Memory/summary or new provider before fixing citations/PDF | Rejected — leaves visible bugs |
| C — Hard TS/ESM cut | Convert all `export =` first | Rejected — high conflict risk, low user value |

**Sequencing:** strict P38 → P39 → P40 gates (same as v8/v9).

---

## 9. Implementation decomposition

Maps to `docs/superpowers/plans/2026-08-17-v10-implementation-plan.md`:
- **P38** — migration, persist/history, PDF+font, score clamp, tests
- **P39** — api split, logger/multer TS, named exports on touched files
- **P40** — E2E stream/settings, FE tests, audit doc, close-out spec status

---

## 10. Decisions locked (from brainstorming)

- Mix: **70% quality/reliability / 30% polish on existing features**
- Horizon: **~3–4 weeks**, gated **P38 → P39 → P40**
- Citations: **persist on Message**, not recompute from chunks on read
- PDF: **client-side** with Unicode font; saved chats use **full export/history**
- API split: **barrel preserves imports**; no big-bang ESM for all routes
