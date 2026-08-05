# Project Evolution Roadmap v2 — Design

**Date:** 2026-08-05  
**Status:** Design for approval (supersedes stale sections of 2026-08-04 roadmap)  
**Scope:** Full-stack personal LLM control panel (`mypersonalllmdesktop`)

## 1. Audit verdict (post P0–P4)

P0–P4 delivered a **usable, Docker-backed** stack: Prisma+pgvector, auth+SSRF baseline, chat Stop/SSE, search/rename/export, Vitest SSE helpers, nginx `/api` proxy.

The product is **not yet production-hardened**. Highest-severity finding:

> **`ChatService.loadRecentMessages` loads the oldest 50 messages** (`orderBy: asc` + `take: 50`), not the newest. Long chats lose current context.

Other high-impact themes: weak request schemas / Ollama option override, SSRF redirect gaps, frontend mostly untyped + untested UI, oversized Prism bundle, Compose insecure defaults + bind-mount `ts-node` fallback.

### Evidence (2026-08-05)
| Layer | Signal |
|-------|--------|
| Backend tests | 129/129 pass; ~83% statements; branch ~65% |
| Frontend tests | 13/13 (SSE only); no RTL/jsdom UI suite |
| Frontend TS | ~5 `.ts(x)` vs ~21 `.js(x)`; `strict: false` |
| Bundle | main ~630 kB / Prism ESM ~979 kB minified |
| Docs | Aug-04 design stale; plan file gitignored/missing |

### Architecture (as-is after P0–P4)

```
Browser (Vite :3000 / nginx)
  → /api (proxy) → Express (dist preferred; ts-node fallback on bind-mount)
       → routes → controllers → services
            → Prisma + pgvector
            → OpenAI / Ollama
Postgres pgvector:pg15 ← prisma migrate deploy on boot
```

## 2. Goals for next cycle

| Horizon | Goal |
|---------|------|
| Immediate (P5) | Correct chat context; safe request schemas; no secret defaults in prod profiles |
| Near (P6) | Frontend quality gates: jsdom RTL, strict TS wave 1, bundle budget |
| Mid (P7) | RAG reliability + search FTS; streaming abort/persist semantics |
| Optional (P8+) | Desktop shell; real multi-provider credentials; refresh-token auth |

**Non-goals:** multi-tenant SaaS, billing, mobile apps, rewriting the stack.

## 3. Approach options

| Option | Description | Trade-off |
|--------|-------------|-----------|
| **A — Correctness-first (recommended)** | Fix context bug + schemas + Compose prod profile, then UI tests/TS, then RAG/ops | Slower features; trustworthy chat |
| B — Features-first | Model CRUD UI + desktop before correctness | UX debt compounds; context bug remains |
| C — Big-bang strict TS + Electron | Parallel rewrite | High risk; blocks shipping |

**Recommendation:** Option A.

## 4. Phases (P5–P8)

### P5 — Correctness & hardening (1–2 weeks)
1. Fix `loadRecentMessages` (desc + reverse) + regression test.
2. Strict Zod/express-validator schemas for chat `options`; stop Ollama payload field override.
3. Production Compose profile: required secrets, no DB port publish, no source bind-mount, `node dist` only.
4. Strip `details` from production 500/SSE error bodies.
5. Replace `new Function` calculator with a safe expression parser (or remove tool).
6. Delete or generate-only `database.sql`; remove dead unused auth validators.

### P6 — Frontend quality & optimization (2–3 weeks)
1. Vitest + jsdom + RTL: stream hook, MessageInput Stop, conversation switch race, Settings error.
2. Domain TS wave: hooks → AuthContext → chat components; enable `strict` incrementally.
3. Bundle: light Prism languages, lazy routes, trim Bootstrap/Framer if cheap.
4. React Query for conversations/history/documents; abort on conversation change.
5. ESLint + Prettier + CI lint; coverage thresholds (backend 80% stmts; frontend smoke suite ≥30 tests).

### P7 — RAG, search, streaming reliability (2–3 weeks)
1. FTS/trigram for `/chat/search` (use existing GIN where possible).
2. Embedding batching + chunk bulk insert; upload job status.
3. Similarity threshold + token-budget packing for RAG.
4. SSE: disable compression for stream route, client disconnect → AbortSignal to provider.
5. Pagination/cursors for conversations/documents lists.

### P8 — Optional product expansion
1. Model catalog CRUD UI (API already exists).
2. HttpOnly refresh cookies + short-lived access tokens.
3. Electron or Tauri shell (pick one; secure IPC).
4. Provider credentials per-user (encrypted) beyond env OpenAI key.

## 5. Success metrics
- Conversation with >50 messages: provider receives **newest** turns (automated test).
- Unvalidated Ollama option cannot override `messages`/`model`/`stream`.
- `docker compose --profile prod up` fails closed without secrets.
- Frontend CI: ≥1 RTL suite green; main chunk gzip target document after Prism trim.
- Search uses index-backed query (explain plan in notes).
- No `new Function` in provider tools.

## 6. Risks
- Prod Compose change may surprise local workflows → keep `dev` profile with bind-mount.
- Strict TS wave will surface prop mismatches; do hooks first.
- Safe math parser must preserve tool UX or drop the tool explicitly.

## 7. Related docs
- Prior design (historical): `docs/superpowers/specs/2026-08-04-project-evolution-roadmap-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-05-project-evolution-v2.md`
- Canvas: project audit beside chat
