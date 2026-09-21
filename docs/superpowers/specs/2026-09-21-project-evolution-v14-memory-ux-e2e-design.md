# Project Evolution v14 — Memory, UX Polish, Deep E2E

**Date:** 2026-09-21  
**Status:** Approved design (awaiting implementation plan)  
**Parent:** Post v13 code-quality hygiene; continues reliability/product thread deferred since v9–v12  
**Scope:** Full wave — conversation memory (summary + editable notes), UX audit→polish, deep E2E suite  
**Approach:** Phased monolith (A) — hard gates P47 → P48 → P49  
**Horizon:** ~3–5 weeks  

**Non-goals:** Redis/BullMQ; vector memory store; multi-tenant/billing; Electron GUI E2E; RAG re-ranker/RRF rewrite; new LLM providers; full visual redesign / theme overhaul

---

## 1. Executive summary

**LLM Assistant Studio** already has chat SSE, hybrid RAG, durable citations, pinned prompts, and a Playwright smoke suite (`stream`, `stream-stop`, `rag-upload`, `rag-xlsx`, settings, login). Long conversations still rely only on a recent-message window (`toProviderMessages(..., 50)`). UX polish has no structured backlog. E2E does not yet assert citations, memory, or settings round-trips.

**v14** ships product reliability in three gated phases:
1. **P47 Memory** — rolling conversation summary + per-conversation editable notes, injected into chat system context
2. **P48 UX** — short audit (≤10 findings) then ≤6 polish fixes
3. **P49 E2E** — citation, memory, settings persistence, hardened stream specs in the existing Docker smoke workflow

---

## 2. Goals & success criteria

| Phase | Gate |
|-------|------|
| P47 | Notes CRUD + ownership; summary field + async roll / manual refresh; context injection covered by unit/smoke; chat still works when summarize fails |
| P48 | Audit artifact committed (≤10 findings); ≤6 polish items merged; manual smoke chat/docs/settings |
| P49 | Four E2E areas green against Docker stack: citation, memory, settings, hardened stream |

**Wave done when:** all three gates pass; existing BE/FE unit suites stay green; API changes are additive only.

---

## 3. Approach

**Phased monolith (A):** one design, sequential hard gates. Memory first (schema + prompt contract), UX on real screens, E2E last on stable behavior.

**Rejected:**
- **B Parallel tracks** — E2E fights memory churn
- **C Thin vertical slices only** — dilutes UX audit and “full” E2E package

**PR policy:** one PR per phase (or one wave PR with atomic commits). Push only when asked.

---

## 4. P47 — Memory / summary

### 4.1 Data model

Additive Prisma migration:

- `Conversation.summary` `String?` `@db.Text`
- `Conversation.summaryUpdatedAt` `DateTime?` `@map("summary_updated_at")`
- `ConversationMemoryNote`:
  - `id`, `conversationId`, `content` (`VarChar(500)` or Text with app max 500), `createdAt`, `updatedAt`
  - relation: conversation `onDelete: Cascade`
  - **Max 20 notes** per conversation (enforced in service)

### 4.2 API

Under existing conversations auth/ownership:

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/conversations/:id/memory` | `{ summary, summaryUpdatedAt, notes: [...] }` |
| POST | `/api/conversations/:id/memory-notes` | create note |
| PATCH | `/api/conversations/:id/memory-notes/:noteId` | update content |
| DELETE | `/api/conversations/:id/memory-notes/:noteId` | delete |
| POST | `/api/conversations/:id/memory/refresh-summary` | manual summarize now |

List/get conversation payloads may include `summary` / `notes_count` additively if cheap; full notes via memory endpoint.

### 4.3 Prompt injection

Extend `buildSystemContext` (after user system prompt + pinned prompts):

1. Memory notes block (if any), total injected notes text capped (**≤2k** chars)
2. Conversation summary block (if any), truncated (**≤4k** chars)

RAG / attachments / history window behavior unchanged: recent linear history still `toProviderMessages(..., 50)`.

### 4.4 Rolling summary

After a successful chat turn (send/stream complete):

- If conversation message count **>** `SUMMARY_THRESHOLD` (env, default **40**)
- And messages since `summaryUpdatedAt` (or since start if null) **≥** `SUMMARY_EVERY_N` (env, default **20**)
- Then **async** summarize via user’s configured provider/model
- Persist summary + `summaryUpdatedAt`
- On failure: log warn; **do not fail** the user turn

Manual refresh uses the same summarizer path.

**Invariant:** messages are never deleted by summarization. Regenerate must not wipe notes/summary.

### 4.5 Frontend

Chat UI: memory panel/drawer —

- CRUD for notes
- Read-only summary text + “Оновити зараз”
- Load via memory API when conversation selected

### 4.6 Tests (P47)

- Service unit: caps, ownership, injection order, summarize failure isolation
- API tests for notes CRUD + refresh
- FE unit for panel interactions (mocked API)

---

## 5. P48 — UX audit → polish

### 5.1 Audit

Surfaces: Chat, Dashboard, Documents/RAG modal, Settings/catalog.

Finding format: `id | surface | severity (S/M/L) | problem | proposed fix`.

Caps: **≤10** findings documented; select **≤6** for polish in this wave.

Artifact: short markdown under `docs/superpowers/` (audit appendix or `plans/` note committed with `-f` if ignored) referenced from the implementation plan.

### 5.2 Polish

Only items from the audit shortlist. Typical candidates (not pre-committed):

- Empty states (conversations / docs / models)
- Stream/stop and error copy clarity
- RAG pending/failed/reindex affordances
- Settings/key/RAG mode busy + validation feedback
- Critical control a11y labels

**Rules:** no theme/layout redesign; no feature creep beyond findings; prefer atomic commits per fix.

### 5.3 Gate

Audit committed; ≤6 fixes merged; manual smoke of chat, docs, settings.

---

## 6. P49 — Deep E2E

Existing workflow `.github/workflows/e2e-smoke.yml` already runs `e2e/ npm test` on Docker. Add/strengthen specs:

| Area | Assert |
|------|--------|
| **Citation** | Upload txt → select doc → ask with unique keyword → assert `.message-sources` / «Джерела» (or explicit skip if embeddings/LLM probe fails) |
| **Memory** | Add note → visible after reload/history; manual refresh or threshold path → summary UI non-empty (stub/mock LLM in CI if needed) |
| **Settings** | Change temperature or system_prompt → save → reload → value persists |
| **Stream hardened** | Strengthen `stream` / `stream-stop`: SSE 200, assistant text appears, stop re-enables composer |

**Rules:**
- Prefer resilient selectors; add `data-testid` only where brittle
- Local fixtures only
- Flaky → one retry or skip with reason — never silent pass
- No Electron Playwright project

**Gate:** `cd e2e && npm test` green against Docker compose stack.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Summary LLM fails / costly | Async; chat unaffected; env thresholds; manual refresh |
| Prompt bloat | Caps: 20 notes, notes ≤2k in prompt, summary ≤4k |
| Citation E2E flaky | Health/probe skip; prefer FTS/keyword path when possible |
| UX audit scope creep | Hard caps 10 / 6 |
| Unpushed local `master` debt | Branch from current master; do not mix unrelated dirty docs |

---

## 8. Rollout & order

1. P47 Memory  
2. P48 UX audit + polish  
3. P49 E2E  

One PR per phase preferred. No feature flags required if additive and summarize is best-effort.

---

## 9. Open follow-ups (not v14)

- Cross-conversation user memory / profiles  
- Vector-backed long-term memory  
- Auto-extract notes from assistant output  
- Electron GUI E2E  
- Making nightly E2E required on every PR (cost/time tradeoff)
