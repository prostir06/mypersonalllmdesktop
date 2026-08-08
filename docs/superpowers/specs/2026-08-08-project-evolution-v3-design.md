# Project Evolution Roadmap v3 — Design

**Date:** 2026-08-08  
**Status:** Approved for implementation  
**Parent:** Supersedes stale “next” sections of `2026-08-05-project-evolution-v2-design.md` after P5–P8 delivery  
**Scope:** Full-stack personal LLM control panel (`mypersonalllmdesktop`)

## 1. Audit verdict (post P5–P8)

P5–P8 delivered a **usable, security-aware** stack: newest-50 chat context, Ollama option lockdown, prod Compose fail-closed, safe math, FTS search, embedding batching, SSE abort, list pagination, Model catalog CRUD, httpOnly refresh cookies, Electron shell, per-user encrypted OpenAI keys.

The product is **not yet “tight”**. Highest-impact remaining themes:

| Severity | Finding | Evidence |
|----------|---------|----------|
| **High** | Axios follows redirects after SSRF allowlist | `ollamaService`, `modelsController` remote fetch |
| **High** | Electron packs `frontend/dist` but Vite emits `build` | `desktop/package.json` extraResources vs `vite.config` `outDir` |
| **High** | Chat still hardcodes model lists; Settings uses catalog | `ChatBoxOptimized` vs `useModels` / Settings |
| **Med** | `getHistory.total` = page length, not DB count | `ChatService.getHistory` |
| **Med** | Sync document upload blocks request (parse+embed) | `DocumentService.uploadAndProcess` |
| **Med** | Frontend `strict: false`; ~18 Vitest tests; JSX largely unlinted | `tsconfig.json`, `eslint.config` |
| **Med** | RAG: no similarity threshold / token budget; weak fallback | `EmbeddingService` |
| **Low** | Fake provider aliases → OpenAI; open self-registration | `providerFactory`, `auth` register |

### Evidence (2026-08-08)

| Layer | Signal |
|-------|--------|
| Backend tests | 169/169; coverage floors statements/lines 75%, functions 70%, branches 50% |
| Frontend tests | 18/18 (5 files); P6 “≥30” not met |
| Frontend TS | Mixed; `strict: false` |
| Desktop | Electron present; packaging path bug |
| HEAD | `85cf1ba` on `master` (synced with origin at last push) |

### Architecture (as-is)

```
Browser / Electron
  → /api (Vite proxy | nginx | Electron uiServer proxy)
  → Express (dist preferred)
       → Prisma + pgvector + FTS GIN + refresh_tokens + openai_api_key_enc
       → OpenAI / Ollama
Postgres pgvector:pg15
```

## 2. Goals for next cycle

| Horizon | Goal |
|---------|------|
| Immediate (P9) | Close security/correctness/packaging holes |
| Near (P10) | Align chat UX with catalog; pagination UI; better upload feedback |
| Mid (P11) | Strict TS + RTL depth; RAG quality; coverage ↑; desktop CI smoke |

**Approach:** Balanced (user-approved **D**): P9 harden → P10 UX → P11 quality/scale.

**Non-goals:** multi-tenant SaaS, billing, Tauri rewrite, new LLM brands without credentials, full stack rewrite.

## 3. Phase P9 — Hardening

1. **SSRF redirects:** `maxRedirects: 0` (or validate final URL) on all outbound axios to Ollama/remote models; tests.
2. **Electron UI path:** unify Vite `outDir` with `desktop` `extraResources` / `devUiRoot` (prefer keep Docker nginx on `build` and point Electron at `build`, or set Vite `outDir: dist` and update Docker — pick one in plan).
3. **`getHistory` total:** `count` + `findMany`; update API consumers if needed.
4. **Upload error hygiene:** no raw internals in production JSON (match chatController pattern).
5. **Optional:** refresh-token reuse detection (revoke all user tokens if revoked hash reused).

**Exit:** tests green; packaged Electron loads UI from the same folder Vite builds; Ollama cannot SSRF via redirect.

## 4. Phase P10 — Product / UX

1. **Chat model source of truth:** `useModels` (+ remote Ollama override as Settings); remove hardcoded `MODEL_OPTIONS` from ChatBox.
2. **Pagination UI:** load-more / “показати ще” for conversations and documents using existing `{ items, total, limit, offset }`.
3. **Document ingest UX:** at minimum progress/disable UI during sync upload; prefer lightweight job status if cheap.
4. **Default model sync:** after Settings save, chat reflects catalog/default without stale hardcode.

**Exit:** chat and Settings show the same catalog-backed models; lists can page; upload doesn’t look “frozen” with no feedback.

## 5. Phase P11 — Quality & scale

1. Strict TS wave 2: pages + chat components; ESLint include `.jsx`.
2. RTL expansion to ≥30 frontend tests (Settings, Login/authReady, Dashboard CRUD smoke, DocumentModal).
3. RAG: similarity threshold + token-budget packing; improve fallback when embeddings missing.
4. Backend coverage floors → ~80% statements (incremental).
5. Desktop CI: `cd desktop && npm test && npm run build:ts` (no GUI).

**Exit:** CI gates stricter; measurable RAG quality knobs; desktop typecheck in CI.

## 6. Suggested execution order

1. P9.1 + P9.2 first (security + unblock desktop ship).  
2. P9.3–P9.4.  
3. P10.1 (highest UX correctness).  
4. P10.2–P10.3.  
5. P11 as capacity allows.

Commit per task group; push only when asked. Ukrainian UI strings in touched surfaces.

## 7. Related docs

- Prior design: `docs/superpowers/specs/2026-08-05-project-evolution-v2-design.md`  
- Plan (gitignored): `docs/superpowers/plans/2026-08-08-project-evolution-v3.md`  
- Canvas: `project-evolution-v3-audit.canvas.tsx`
