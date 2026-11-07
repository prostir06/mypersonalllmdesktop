# Project Evolution Roadmap v15 — Reliability, Debt, UX, Memory 2.0

**Date:** 2026-10-27  
**Status:** Implemented — waves 1–4 done on `master` path (2026-10-27)  
**Parent:** Post v14 (P47–P48 done; P49 E2E deferred) + error-handling hygiene G=0 + performance P0/SLI closeout  
**Scope:** Four gated waves for further development and targeted code optimization; roadmap analysis of current project state  
**Approach:** Classical sequence (stability → hygiene → UX → Memory 2.0)  
**Horizon:** Four waves; one PR chain per wave; hard gate between waves  

**Non-goals (whole cycle):** Redis/BullMQ; multi-tenant/billing; Electron GUI E2E; vector long-term memory store; auto-extract notes from assistant output; aggressive Prisma major / SheetJS force-replace; full UI redesign / theme overhaul; new LLM providers; H1–H5 infra optimizations from the performance roadmap (remain backlog unless a later wave reopens them with SLI evidence)

---

## 1. Executive summary

**LLM Personal Assistant Control Panel** is a personal full-stack app: Express + Prisma (pgvector), React/Vite, optional Electron, Docker Compose, SSE chat, hybrid RAG, JWT auth, conversation memory (summary + notes).

Waves through v14 and hygiene closed modularity, memory UX, thin controllers, and try/catch G=0. Remaining pressure is **E2E reliability (P49)**, **dependency/lint debt**, **leftover UX audit items**, and **cross-conversation user memory**.

**v15** is a balanced four-wave roadmap (not a single feature dump):

| Wave | Focus | Gate (summary) |
|------|--------|----------------|
| **1** | P49 E2E / CI (Docker Playwright) | Four areas green; auth path in CI |
| **2** | Targeted debt / opt (soft lint, audit hygiene) | lint/tsc/unit green; no major rewrite |
| **3** | UX polish (cap ≤6 from v14 audit remainder) | Checklist done; FE tests on touched surfaces |
| **4** | Memory 2.0 (cross-conversation user notes) | API + UI + tests; prompt caps; chat non-regress |

**Deliverables of this design cycle:** this spec. The wave plans stayed local and are not in the repository.

---

## 2. Current state (analysis)

### 2.1 Architecture

| Layer | Role |
|-------|------|
| Backend | Express + Prisma; chat SSE; in-process document indexing queue |
| RAG | Chunk → embed → hybrid vector + FTS → pack; durable `Message.sources` |
| Chat | Prepare context (RAG + conversation memory) → provider stream → persist |
| Memory (today) | Per-conversation summary + editable notes (`ConversationMemoryNote`) |
| Frontend | React Query; ChatBox orchestrator; Settings, Documents modal, Memory panel |
| Desktop | Electron shell + `/api` proxy (must not buffer SSE) |
| Data | User, Conversation, Message, Document/Chunk, UserSettings, prompts, refresh tokens |

**Scale (approx.):** backend prod ~6.6k LOC, frontend ~7.1k, desktop ~0.8k; 10 Prisma models; Jest + Vitest + Playwright smoke.

### 2.2 Closed recently

- v13 thin controllers / FE split  
- v14 P47–P48 memory + UX polish shortlist (partial)  
- Error-handling hygiene inventory **G=0**  
- Performance P0 + Docker SLI closeout (full S1 first-token still provider-limited)  
- CI/Docker hygiene: Node 24 for jsdom/undici, audit baseline refresh, logger EACCES fallback, string conversation id ownership  

### 2.3 Residual risks / backlog inputs

| ID | Item | Feeds wave |
|----|------|------------|
| R1 | P49 E2E not fully green (login/env blocker) | 1 |
| R2 | Known GHSA allowlist (`xlsx`, router, Electron packaging, etc.) | 2 (hygiene only) |
| R3 | Soft lint gates (`max-lines`, empty-catch) not in CI | 2 |
| R4 | Perf hotspots H1–H5 documented; no infra in v15 | backlog |
| R5 | UX audit leftovers (esp. U3, U7, U9; verify U1–U8 shortlist) | 3 |
| R6 | Memory only per-conversation | 4 |
| R7 | Large test files (e.g. `ChatService.test`) — touch only if needed | — |

### 2.4 Explicitly deferred outside v15

- Electron GUI E2E  
- Vector-backed long-term memory / auto-extract notes  
- Making nightly E2E fail hard when LLM unavailable  
- Prisma/SheetJS major security upgrades that need a dedicated wave  

---

## 3. Goals & success criteria

| Wave | Success |
|------|---------|
| 1 | `cd e2e && npm test` green against Docker Compose; citation, memory, settings persistence, hardened stream; CI auth/login path works without silent skips |
| 2 | Soft ESLint warnings enabled (`max-lines`, `no-empty` or equivalent); non-breaking `npm audit fix` + baseline update; unit/lint/tsc green; **no** Prisma major / xlsx force |
| 3 | ≤6 UX items closed from v14 audit remainder + unfinished polish; no theme rewrite |
| 4 | User-scoped memory notes CRUD; injected into chat prompt with caps alongside conversation memory; unit + minimal cross-conv E2E; stream still works if user-memory fetch fails |

**Cycle done when:** all four wave gates pass on `master` sequentially.

---

## 4. Wave 1 — P49 E2E / CI

**Implementation status:** Done — Docker E2E green (2026-10-27); LLM-dependent specs skip with reason when provider missing.

### 4.1 Intent

Close the deferred v14 P49 runtime gap: deep Playwright coverage against the real compose stack.

### 4.2 Work

- Unblock CI/login env (seed user, test credentials, or compose override — choose least invasive in plan)  
- Strengthen/add specs: **citation**, **memory**, **settings**, **stream hardened** (SSE 200, assistant text, stop re-enables composer)  
- Prefer resilient selectors; `data-testid` only where brittle  
- Flaky → one retry or skip **with reason** — never silent pass  
- Local fixtures only; no Electron Playwright project  

### 4.3 Gate

Docker E2E job green for the four areas; auth path reliable in CI.

### 4.4 Out of wave

Electron E2E; hard-fail when LLM probe unavailable as permanent policy.

---

## 5. Wave 2 — Targeted debt / optimization

**Implementation status:** Done — soft lint + audit hygiene (2026-10-27).

### 5.1 Intent

Reduce regression risk and dependency noise **without** large refactors (user constraint: targeted only).

### 5.2 Work (capped)

- Soft ESLint: `max-lines` warning + `no-empty` (or swallow detector) for backend/frontend  
- Touch 1–2 hotspot production files **only** if already over line threshold **and** required by this wave’s lint baseline — no drive-by service splits  
- Audit hygiene: non-breaking `npm audit fix`; refresh `docs/security-audit-baseline.md` / `audit-ci` allowlist  
- Optional cheap perf notes from existing performance playbook (document numbers only); **no** Redis/BullMQ, no retrieve parallelism rewrite  

### 5.3 Gate

lint / tsc / unit green; CI does not fail on **new** high/critical GHSA; soft rules are warnings.

### 5.4 Out of wave

Prisma major upgrades, SheetJS replacement, wide FE hook/service refactor, H1–H5 infra.

---

## 6. Wave 3 — UX polish

**Implementation status:** Done — U3/U7/U9 (2026-10-27); see `2026-10-27-v15-w3-ux-ids.md`.

### 6.1 Intent

Finish product polish from `2026-09-21-v14-ux-audit.md` without new subsystems.

### 6.2 Work (hard cap ≤6 items)

Priority remainder: **U3** empty-state copy, **U7** sidebar loading a11y, **U9** document status badge/helper.  
Also close any still-open polish shortlist items (**U1, U2, U4, U5, U6, U8**) if verification finds them incomplete.  
Plan must list the exact ≤6 IDs before coding.

### 6.3 Gate

Checklist in plan all done; FE unit/smoke on touched surfaces green.

### 6.4 Out of wave

Theme overhaul, i18n framework, Electron UI work, new features beyond audit IDs.

---

## 7. Wave 4 — Memory 2.0 (cross-conversation)

**Implementation status:** Done — UserMemoryNote API/UI/E2E (2026-10-27).

### 7.1 Intent

User-level memory that applies across conversations (complement to per-conversation summary/notes).

### 7.2 MVP shape

- Persistence: e.g. `UserMemoryNote` (or equivalent) owned by `userId` — CRUD API with ownership checks  
- Prompt injection: pack user notes into system context **with hard caps** (max notes count + max chars)  
- Prompt order (fixed): user notes → conversation summary → conversation notes → RAG pack  
- UI: simple section in Settings **or** extension of Memory panel — one surface only in MVP  
- Failure mode: fetch/pack errors are best-effort — chat/stream continues without user memory; log structured error; no 500 on stream path  

### 7.3 Gate

API + UI + backend tests + one E2E proving a user note influences a **new** conversation; existing stream/memory behavior non-regress.

### 7.4 Out of wave

Vector LTM, auto-extract from assistant output, multi-profile personas, cross-user sharing.

---

## 8. Data flow & dependencies

```
Wave 1 (E2E green)
    → Wave 2 (soft lint + audit hygiene)
        → Wave 3 (UX on stable UI/E2E)
            → Wave 4 (UserMemory → prompt pack + UI; builds on v14 conversation memory)
```

Each wave merges only when its gate is green on `master`. No mixing unrelated dirty docs into wave PRs.

### Error-handling policy

- Preserve G/S/H/T try/catch taxonomy from hygiene wave; no new empty catches  
- Wave 1: skip-with-reason ≠ pass  
- Wave 4: user-memory miss/fail must not break chat  

### Testing matrix

| Wave | Minimum verification |
|------|----------------------|
| 1 | Playwright Docker four areas + CI auth |
| 2 | lint / tsc / unit; `audit:ci` |
| 3 | FE tests on changed components; chat smoke |
| 4 | BE service/API tests + one cross-conv E2E |

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| E2E flaky LLM / embeddings | Health/probe skip with reason; prefer FTS/keyword for citation where possible |
| Soft lint noise | Warning-only; baseline existing violations if needed |
| Wave 3 scope creep | Hard cap 6 UX IDs listed in plan before code |
| Wave 4 prompt bloat | Caps + fixed injection order |
| Plans for all four waves upfront go stale | Plans are detailed but wave 2–4 may get a short amend commit if master drifted; do not implement wave N+1 before N gate |

---

## 10. Implementation plans (next artifact)

The wave plans stayed local and are not in the repository. This spec is the source of truth.

Execution order was W1 → W2 → W3 → W4.

---

## 11. Open follow-ups (not v15)

- Electron GUI E2E  
- Vector-backed long-term memory; auto-extract notes  
- Nightly E2E hard-fail when LLM unavailable  
- Dedicated security wave: Prisma/SheetJS/Electron packaging majors  
- Performance wave reopening H1–H5 with fresh SLI baselines  
- Soft → hard ESLint `max-lines` after codebase is clean  
