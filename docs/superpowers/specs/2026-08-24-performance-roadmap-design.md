# Project Evolution — Performance Roadmap & Optimization Backlog

**Date:** 2026-08-24  
**Status:** Approved — P0 code shipped; SLI gates closed on Docker (2026-09-21) except full S1 first-token (provider-limited)  
**Parent:** v12 Implemented (P44–P46) on `master` @ `44819bb`  
**Scope:** Full-project analysis after v12 + **metric-gated** backlog for development and code optimization  
**Primary focus:** Performance (TTFT, indexing, history, FE)  
**Horizon:** No fixed sprint length — prioritized backlog only; future waves (e.g. v13) pick items after baselines  
**Approach:** Measure all relevant surfaces first → cut top bottlenecks → introduce new infra only if metrics justify it  

**Non-goals for this document’s implied work:** multi-tenant/billing, extra LLM providers, Postgres inside Electron, aesthetic FE rewrites, Redis/BullMQ “just in case”, RRF/re-ranker without a quality goal, auto-publish CI, Electron GUI E2E as a perf task  

---

## 1. Executive summary

**LLM Assistant Studio** is a personal full-stack control panel: Express/Prisma backend, React/Vite frontend, optional Electron shell, PostgreSQL/pgvector, OpenAI/Ollama, hybrid RAG (PDF/DOCX/XLSX/TXT/MD), chat UX (SSE, branches, prompts, attachments), Docker Compose.

Waves v9–v12 improved modularity, durable citations, SheetJS RAG, retrieve façade, indexing honesty (`ragStatus`, boot requeue), and ESM/HTTP hygiene. Throughput was **not** the primary target of those waves.

This spec does **not** mandate an immediate implementation wave. It:

1. Records the post-v12 architecture and residual hotspots  
2. Defines **SLIs** and a **baseline playbook** that gate any optimization  
3. Provides a **P0 / P1 / P2 backlog** mapped to those SLIs for later `writing-plans` / v13+  

**Rule:** no P0 “must-fix” ships without before/after numbers on the relevant SLI.

---

## 2. Current state (baseline for this roadmap)

### 2.1 Architecture (carry forward)

| Layer | Role |
|-------|------|
| Backend | Express + Prisma; chat SSE; document job queue (in-process) |
| RAG | Chunk → embed (OpenAI batch / Ollama sequential) → hybrid vector + FTS → pack (~6000 chars, minSimilarity 0.25) |
| Chat | `prepareMessages` (RAG sync) → ProviderFactory stream → persist + `sources` / `ragStatus` |
| Frontend | React Query; ChatBox orchestrator; rAF token coalescing; lazy routes + `manualChunks` |
| Desktop | Electron UI server + `/api` proxy (must not buffer SSE) |
| Data | `DocumentChunk.embedding` HNSW; `contentTsv` GIN FTS; message/conversation indexes |

### 2.2 Strengths after v12

- Auth: JWT access + httpOnly refresh; AES-GCM per-user OpenAI keys; registration gate  
- RAG: module split (`vectorSearch` / `ftsSearch` / `retrieve` / `hybridFusion`); sheet-aware chunking; durable `Message.sources`; watchdog + boot requeue  
- Reliability signals: `ragStatus` (`ok` \| `empty` \| `error`); stream callback failures no longer swallowed  
- Tests: backend Jest ~305; frontend Vitest; desktop unit tests; Playwright including stream-stop  
- CI: BE/FE/desktop + docker build; E2E on schedule/manual  

### 2.3 Performance hotspots (candidates — not yet ranked by measurement)

| ID | Issue | Location | Likely SLI |
|----|--------|----------|------------|
| H1 | Ollama embeddings **sequential** per chunk | `OllamaEmbeddingProvider` | S3 |
| H2 | Vector then FTS **sequential** in retrieve | `embeddings/retrieve.ts` | S1, S2 |
| H3 | Full prep (settings, prompts, embed, search) **before** first SSE token | `ChatService` / `systemContext` | S1 |
| H4 | Load **all** conversation messages then linearize/slice (~50) | `chat/history.ts` | S4 |
| H5 | Attachment extracted text inlined into system prompt | chat attach path | S1, cost |
| H6 | Large FE surfaces (~300+ LOC) left intentionally unsplit | PromptLibrary, DocumentModal, ModelCatalog, ChatBox, `useChatStream` | S5 / maintainability |
| H7 | In-process index queue (restart / no horizontal scale) | `documentJobQueue` | S3, S6 |

### 2.4 Intentionally deferred since v10–v12 (still deferred here unless SLI unlocks)

- Redis/BullMQ durable workers  
- Conversation memory / summary subsystem  
- RAG RRF / re-ranker  
- Splitting every large FE modal “because large”  
- Full controller LOC goals as a pure hygiene wave (thin when touching or when P1-3 is scheduled)

---

## 3. Approach: metric-gated backlog

**Chosen approach:** define SLIs and a repeatable baseline first; map every backlog item to the SLI it should move; allow Redis/BullMQ only if S3 and/or S6 show an in-process ceiling that code changes cannot fix.

**Rejected alternatives (for this spec):**

- Audit-only catalog ranked “by eye” without SLIs — high risk of optimizing the wrong layer  
- Mixed perf+features matrix without a baseline step — scope blur and unmeasurable “done”

---

## 4. SLIs and baseline playbook

### 4.1 Service level indicators

| ID | Metric | How to measure | Success signal |
|----|--------|----------------|----------------|
| **S1** | Time to first token (TTFT) | From `POST /chat/stream` accept to first SSE `token` frame; run **with RAG** and **without RAG** | p50/p95 lower than baseline |
| **S2** | RAG prep latency | Query embed + vector search + FTS (+ fusion); optional span logs | Lower when H2/H3 dominate S1 |
| **S3** | Index throughput | Chunks (or docs) per minute; **OpenAI and Ollama separately** | Higher; unlocks P0-3 if Ollama << OpenAI |
| **S4** | History / prepare cost | Wall time for history path at N ≈ 50, 200, 1000 messages (branched tree if feasible) | Flat or slower growth vs N after fix |
| **S5** | FE chat interactivity | Dashboard/chat route: JS chunk sizes (existing README budgets) and/or time-to-interactive smoke | No regression; improve only if bloated |
| **S6** | Queue durability after process death | Kill backend mid-index; observe pending/failed/requeue behavior | Only elevates P2-1 if ops pain + S3 saturation |

### 4.2 Baseline playbook (B0 — mandatory before ranked fixes)

1. **Fixtures:** one small `.txt`, one multi-sheet `.xlsx`, conversations at ~50 and ~500+ messages; OpenAI and/or Ollama as available in the environment  
2. **Instrumentation:** structured timing logs or a one-off `scripts/perf-baseline` (implementation deferred to a later plan); record machine class (Docker limits vs bare metal)  
3. **Record:** table of S1–S5 (and S6 if exercised) with date, commit SHA, provider, RAG on/off  
4. **Store:** results under `docs/` (e.g. note beside this spec or a short `docs/perf-baseline-YYYY-MM-DD.md`) or in the PR description of the first optimization wave  
5. **Infra decision:** Redis/BullMQ only if S3/S6 prove in-process limits after P0 code fixes are considered or measured insufficient  

### 4.3 Gate rule

A P0 item is **not done** without repeating the same SLI procedure used in B0 and showing improvement (or an explicit “no-op / abandon” note if measurement disproves the hypothesis).

---

## 5. Prioritized backlog

Execution order for any future wave: **B0 first**, then items ordered by **measured** SLI rank, not by this table’s default order alone.

### 5.1 P0 — baseline + high-ROI code paths

| ID | Item | Targets | Notes |
|----|------|---------|-------|
| **B0** | Run baseline playbook; publish numbers | All SLIs | Blocks confident prioritization |
| **P0-1** | Parallelize vector ∥ FTS in `retrieve` (`Promise.all`) | S1, S2 | Low risk if S2 is material |
| **P0-2** | Parallelize independent reads in system-context prep (settings / pinned prompts / embedding resolve) | S1 | After span profile confirms sequential wait |
| **P0-3** | Ollama embedding concurrency or true batch API (bounded pool) | S3 | Only if S3 Ollama lags OpenAI / wall clock |
| **P0-4** | Cap history in SQL (do not load entire conversation then slice) | S4 | Only if S4 grows with N |

### 5.2 P1 — deeper optimization and maintainability that serves perf

| ID | Item | Targets / value |
|----|------|-----------------|
| **P1-1** | Earlier SSE `init` / progressive prep (stream before RAG completes) | S1 — **only if** product accepts possible late `sources` / UX rules |
| **P1-2** | Cap or summarize attachment text before prompt pack | S1, token cost |
| **P1-3** | Thin `documents` / `chat` controllers further into services | Change safety |
| **P1-4** | Split hot FE modals only when S5 regresses or a change already edits the file | S5 / hygiene |
| **P1-5** | `EXPLAIN` / tune HNSW & GIN under realistic cardinality | S2 |

### 5.3 P2 — product / scale (separate waves)

| ID | Item | Unlock condition |
|----|------|------------------|
| **P2-1** | Redis/BullMQ (or equivalent) durable index workers | S3 + S6 after P0 attempts |
| **P2-2** | Conversation memory / summary | Product decision, not first perf lever |
| **P2-3** | RRF / re-ranker | Retrieval **quality** goal |
| **P2-4** | Broader Electron E2E / auto-publish CI | Ops / release |
| **P2-5** | New providers / multi-tenant | Explicit product scope |

Non-perf product polish may be pulled from P2 (or a future product spec) only after P0 is closed by metrics or consciously deferred in writing.

---

## 6. Testing and regression expectations (for future implementation)

When a wave implements P0/P1 items:

- Existing Jest suites for RAG, chat, queue/watchdog stay green  
- Add/extend unit tests for concurrency/parallelism behavior introduced  
- Do not regress `ragStatus`, durable citations, or Playwright `stream-stop` / RAG upload paths  
- Re-run the B0 SLI script or equivalent and attach numbers to the PR  

---

## 7. Success criteria for this specification

1. Single source of truth for post-v12 state and residual hotspots  
2. Explicit SLIs + baseline gate (“no baseline → no must-fix”)  
3. Clear P0/P1/P2 backlog usable as input to `writing-plans` without inventing scope mid-flight  
4. Infra expansion is evidence-based (S3/S6), not speculative  

---

## 8. Next steps after approval

1. User reviews this file; request edits if needed  
2. On approval of the written spec: invoke **writing-plans** only when starting a concrete wave (recommended first plan: **B0 + whichever P0 items baseline ranks highest**)  
3. Do not treat this roadmap as an open-ended “fix everything” mandate  

---

## 9. Spec self-review notes

- No TBD placeholders for required decisions: infra = measure-then-decide; progressive SSE = P1 with explicit UX gate  
- Consistent with v12 non-goals unless SLI unlocks P2-1  
- Scope is one roadmap document, not an unbounded multi-subsystem build  
- Ambiguity resolved: backlog order after B0 is **measurement-driven**; table order is a default hypothesis only  
