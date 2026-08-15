# Project Evolution v9 — Design

**Date:** 2026-08-15  
**Status:** Implemented  
**Parent:** v8 delivered on `master` @ `c4d5c75` (P31–P34 largely implemented in code; v8 design file previously lagged as Draft)  
**Scope:** P35 Quality → P36 Reliability → P37 Product polish  
**Mix:** ~70% quality/reliability, ~30% product polish (small deliverables across RAG + Chat + Desktop)  
**Horizon:** ~3–4 weeks (one gated wave)  
**Non-goals:** multi-tenant orgs/billing, additional LLM providers beyond OpenAI+Ollama, Redis/BullMQ distributed queues, bundling Postgres inside Electron, full CI auto-release publish pipeline, conversation memory/summary as a new subsystem, RAG re-ranker models / RRF rewrite

---

## 1. Executive summary

**LLM Assistant Studio** is a personal full-stack control panel: Express/Prisma + React/Vite + optional Electron, PostgreSQL/pgvector, OpenAI/Ollama, document RAG (hybrid vector+FTS), chat UX (pinned prompts, branches/regenerate, ephemeral attachments), and a desktop shell (tray, updater, deep links).

v8 shipped the major feature surface. **v9 is a hygiene + reliability wave with limited polish**, not a greenfield feature wave. The highest ROI is reducing change risk in god-modules and making Docker/E2E/CI reflect reality, then adding three small product finishes.

---

## 2. Current state (baseline for v9)

### Strengths
- Auth: JWT access + refresh cookies, registration gate, encrypted OpenAI keys
- RAG: pgvector embeddings (OpenAI/Ollama), FTS on chunks, hybrid fusion
- Chat: SSE stream, stop, branches/`parentId`, pinned `UserPrompt`, chat attachments
- Desktop: `mypersonalllm://chat/<id>`, tray, `electron-updater`, Settings update card
- Tests: ~263 backend Jest (coverage gates), ~50 frontend Vitest, ~19 desktop node:test
- CI: lint/tsc/audit/Jest+pgvector, frontend build, desktop pack, docker build; nightly E2E smoke

### Hotspots / debt
| Item | Evidence | Risk |
|------|----------|------|
| `ChatService.ts` | ~549 LOC orchestration | High — every chat change touches one class |
| `DocumentService.ts` | ~451 LOC façade (partial split already under `services/documents/*`) | High |
| `ChatBoxOptimized.tsx` | ~475 LOC wiring | High — FE regression magnet |
| Bootstrap `server.js` | JS + optional ts-node path | Medium — dual runtime |
| CJS/`export =` dualism | Many services/routes | Medium — slows TS cleanup |
| Spec drift | v8 marked Draft while code shipped | Low — process debt |
| Docker bind-mount | Host `dist/` shadows image | Medium — stale API in dev |
| Frontend healthcheck | Reports unhealthy despite HTTP 200 | Low — false signal |
| E2E thin | Single smoke flow | Medium — regressions slip past CI |
| Desktop polish gaps | Placeholder tray icon; updater publish undocumented | Low–Medium product |

---

## 3. Phase plan (hard gates)

### Phase P35 — Quality foundation (~40%)
**Gate:** backend + frontend typecheck/tests green; Chat/Document/ChatBox complexity reduced via focused modules; server boot is TypeScript-first; specs index matches repo.

**Outcomes**
1. **Spec sync**
   - Mark v8 Implemented in index + file header; note residuals if any
   - Align older headers (e.g. v6) that still say Draft while README says Implemented
2. **TS server bootstrap**
   - Move authoritative entry to TypeScript (`server.ts` → `dist/server.js`)
   - Entrypoint runs compiled server; ts-node only as explicit documented fallback (or removed in favor of rebuild)
3. **Split god-modules (ordered)**
   - `ChatService` → `services/chat/*` (ownership, system context, persist, send/stream façade)
   - `DocumentService` → finish extraction into `services/documents/*`; façade = orchestration only
   - `ChatBoxOptimized` → hooks/helpers for attach/export/regenerate; component = composition
4. **Style rule for touched code**
   - Prefer named ESM/TS exports on new/edited files; no new `export =` / `require` without need
5. **Tests**
   - Keep existing suites green; add unit tests for extracted pure helpers

**Non-goals P35:** new APIs, RAG citations UI, PDF export, tray art, E2E expansion.

### Phase P36 — Reliability (~30%)
**Gate:** expanded E2E scenarios pass against Compose; Docker stale-`dist` failure mode is loud; frontend critical-path coverage floor exists; CI remains green without making every PR run full E2E.

**Outcomes**
1. **E2E expansion** (`e2e/` + nightly `e2e-smoke.yml`)
   - Login / session refresh path
   - Stream happy path (assistant message persisted)
   - RAG: upload TXT → select → send with RAG
   - Settings smoke (system prompt save) without requiring live OpenAI
   - Dashboard `?conversation=` deep-link query (web)
2. **Docker hygiene**
   - Dev entrypoint: detect src newer than dist → rebuild or fail with clear message
   - Fix frontend container healthcheck (tool available in nginx image)
   - README one-liner recovery for bind-mount prisma/dist issues
3. **Frontend quality floor**
   - Soft coverage threshold on hooks/services **or** targeted tests for: branch switch, PromptLibraryModal API, electron deep-link navigate helper
4. **Observability**
   - `requestId` present on remaining JSON error paths that omit it
5. **CI policy**
   - PR: unit + docker build (status quo+)
   - Nightly: expanded E2E

**Non-goals P36:** product polish features, Electron updater packaging in CI.

### Phase P37 — Product polish (~30%)
**Gate:** three polish deliverables work without breaking SSE/history; desktop tray/updater manual checklist done.

**Outcomes**
1. **RAG citations UX**
   - After RAG-backed answers, show a “Джерела” block (filenames ± relevance)
   - Reuse existing chunk metadata already injected into system context / optional structured SSE or response field if needed for clean UI
   - No RRF rewrite, no cross-encoder re-ranker
2. **Chat PDF export**
   - Prefer **client-side PDF** from existing Markdown export (minimize backend deps)
   - Keep MD/TXT/JSON export paths
3. **Desktop productization**
   - Real tray icon asset
   - Tray menu: Show / Settings / Check updates / Quit
   - Document GitHub Releases (or generic) publish steps in `desktop/README.md`
   - Updater IPC/UI already present — polish wiring only

**Non-goals P37:** multi-provider, memory/summary subsystem, auto-publish CI, bundling DB in Electron.

---

## 4. Architecture (what changes)

### 4.1 Module boundaries (P35)

```
ChatService (façade)
  ├─ ensureConversation / ownership
  ├─ buildSystemContext (settings + pinned prompts + RAG + attachments)
  ├─ loadHistory / branches (conversationHistory)
  ├─ persistTurn
  └─ sendMessage / streamMessage → ProviderFactory

DocumentService (façade)
  ├─ documents/extraction
  ├─ documents/chunking
  ├─ documents/tempUploads
  ├─ documents/status
  └─ embed/reindex orchestration

ChatBoxOptimized (view)
  ├─ useChatStream / useChatDocuments / useConversationHistory
  └─ thin handlers → MessageList / MessageInput / modals
```

### 4.2 Reliability surface (P36)
- No new public HTTP resources required for E2E itself
- Entrypoint behavior change is operational, not API
- Optional: pass structured `sources[]` later for citations (can land in P37 if FE cannot parse system context)

### 4.3 Polish surface (P37)
- Citations: prefer structured field on chat done/history (`sources?: { filename, similarity? }[]`) over scraping markdown of system prompts — **recommended** if SSE already returns `done` payload
- PDF: frontend-only library or print-to-PDF path; pin dependency in `frontend/package.json`
- Desktop: assets under `desktop/assets/` (or `build/`); tray menu opens Settings via IPC → renderer navigate `/settings`

---

## 5. Testing strategy

| Phase | Automated | Manual |
|-------|-----------|--------|
| P35 | Existing Jest/Vitest + new helper unit tests; `tsc` | Spot-check chat send/stream after split |
| P36 | Expanded Playwright nightly; FE coverage floor or targeted tests | Compose up health statuses match reality |
| P37 | Unit tests for sources mapping + PDF export smoke; desktop deepLinks already covered | Tray icon/menu; updater check on packaged build |

---

## 6. Acceptance criteria (v9)

1. Specs index: v7/v8/v9 statuses match repository reality.
2. `ChatService` / `DocumentService` / `ChatBoxOptimized` are façades over focused modules (each extracted unit has clear ownership).
3. Backend starts from compiled TS entry in Docker; stale-dist failure is explicit in dev bind-mount.
4. Nightly E2E covers login, stream, RAG upload path, and conversation query deep-link.
5. RAG answers can show source filenames in UI when RAG was used.
6. User can export a chat to PDF from the UI.
7. Desktop tray has a real icon and Settings/Check updates actions; updater publish path is documented.
8. Backend Jest + frontend Vitest + desktop tests + typechecks pass; no high/critical audit regressions introduced deliberately.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Split ChatService breaks regenerate/branches | Keep `conversationHistory` tests; add façade integration test for regenerate path |
| Client PDF quality poor | Ship MVP; backend PDF later only if needed |
| Structured `sources` needs API change | Optional additive field; FE degrades to “no sources” if absent |
| E2E flaky vs Ollama/OpenAI | Prefer mocks / skip live providers; use TXT RAG without embeddings if needed |
| Bind-mount rebuild slows startup | Only rebuild when mtime detects staleness |

---

## 8. Implementation decomposition

Maps to one implementation plan with sequential tasks:
- **P35** — docs sync, TS boot, Chat/Document/ChatBox splits + tests
- **P36** — entrypoint/healthcheck, E2E suite, FE quality floor, requestId sweep
- **P37** — sources field/UI, PDF export, tray icon/menu + updater docs

Execution preference remains: hard gates between phases (no P36 before P35 green; no P37 before P36 green unless a polish item is fully isolated — default is sequential).

---

## 9. Decisions locked (from brainstorming)

- Mix: **70% quality/reliability / 30% features**
- Features: **small polish across RAG + Chat + Desktop** (not one large feature)
- Horizon: **full v9 wave ~3–4 weeks** (P35→P36→P37)
- Approach: **sequential gated phases** (v8-style)
