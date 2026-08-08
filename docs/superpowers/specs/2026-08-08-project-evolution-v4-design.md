# Project Evolution Roadmap v4 — Design

**Date:** 2026-08-08  
**Status:** Approved for implementation  
**Parent:** Supersedes “next” sections of `2026-08-08-project-evolution-v3-design.md` after P9–P11 delivery  
**Scope:** Full-stack personal LLM control panel (`mypersonalllmdesktop`)  
**Approach:** User-approved **B** — security/ops first (P12), then quality (P13), then polish (P14)

---

## 1. Audit verdict (post P5–P11)

HEAD at design time: `c9f387d` (`fix(db): strip UTF-8 BOM from 0_init migration`).

P5–P11 delivered a **usable, security-aware** stack: newest-50 context, Ollama lockdown, prod Compose fail-closed, safe math, FTS, embed batching, SSE abort, list pagination, model catalog + chat picker sync, httpOnly refresh, Electron↔Vite `build` path, encrypted OpenAI keys, SSRF `maxRedirects: 0`, accurate history `total`, upload prod error hygiene, RAG similarity/char pack, frontend `strict: true`, ≥30 FE tests, BE coverage floors ~80%, desktop CI smoke, BOM-free `0_init`.

The product is **tighter than v3**, but not “ops-complete”. Highest-impact remaining themes:

| Severity | Finding | Evidence |
|----------|---------|----------|
| **High** | Open self-registration | `routes/auth.ts`, `authController` |
| **High** | Sync document ingest (parse+embed on request) | `DocumentService.uploadAndProcess` |
| **High** | Default Compose bind-mount can serve stale/missing host `dist` | `docker-compose.yml` + entrypoint ts-node fallback |
| **Med** | `/api/chat/send` does not force `enableTools: false` (stream does) | `chatController` |
| **Med** | No refresh-token reuse detection | `refreshTokens.ts` |
| **Med** | Chat `options` lack schema validation | `routes/chat.ts`, `ChatService` |
| **Med** | JSX-heavy UI; no Settings/ChatBox RTL | `Settings.jsx`, `ChatBoxOptimized.jsx` |
| **Med** | RAG per-request schema probe; weak no-embed fallback | `EmbeddingService` |
| **Low** | Fake provider aliases → OpenAI | `providerFactory` |
| **Low** | No explicit JWT `algorithms`; no request-id | `middleware/auth.js`, `errorHandler` |
| **Low** | Prod entrypoint does not require `ENCRYPTION_KEY` | `docker-entrypoint.sh` vs compose prod |

### Evidence (2026-08-08)

| Layer | Signal |
|-------|--------|
| Backend tests | 178/178; floors statements/lines/functions 80%, branches 55% |
| Frontend tests | 31/31; `strict: true` |
| Desktop | CI `test-desktop`; UI path → `frontend/build` |
| Docker | Stack boots after BOM fix; chat without real OpenAI key → expected 500 |

### Architecture (as-is)

```
Browser / Electron
  → /api (Vite proxy | nginx | Electron uiServer)
  → Express (dist preferred; bind-mount may override in default compose)
       → Prisma + pgvector + FTS + refresh_tokens + openai_api_key_enc
       → OpenAI / Ollama
Postgres pgvector:pg15
```

---

## 2. Goals for next cycle

| Horizon | Goal |
|---------|------|
| Immediate (P12) | Gate registration; lock chat tools/options; refresh reuse; start async ingest; honest Compose/dist/prod secrets |
| Near (P13) | Settings/ChatBox TypeScript + RTL; RAG probe cache; ESLint tighten; catalog vision flag |
| Mid (P14) | Honest providers; JWT algorithms; request-id; branch coverage ↑; optional Electron pack CI |

**Non-goals:** multi-tenant SaaS, billing, Tauri rewrite, new LLM brands without credentials, full stack rewrite.

---

## 3. Phase P12 — Harden & ops

1. **Registration gate**  
   - Env `ALLOW_REGISTRATION` (`true`/`false`).  
   - Recommended default: `true` in local/dev compose docs; `false` (or “only if zero users”) when `NODE_ENV=production`.  
   - `POST /api/auth/register` returns 403 when disabled. UI Login/Register: hide or disable register link when gated (optional FE if cheap).

2. **Chat `/send` parity with stream**  
   - Force `enableTools: false` (or same allowlist as stream).  
   - Add express-validator / Zod for chat body + known `options` keys.  
   - Regression tests.

3. **Refresh-token reuse detection**  
   - On attempt to rotate a **revoked** refresh token hash: revoke **all** refresh tokens for that user; return 401.  
   - Prefer atomic rotate (transaction). Tests for reuse path.

4. **Async document ingest (MVP)**  
   - Accept upload → persist file/doc row as `pending` → return `202` with `{ documentId, status }` (or job id).  
   - Background process (in-process queue acceptable for personal deploy) → parse/embed → `ready`/`failed`.  
   - `GET /api/documents/:id` or list field `status` for polling.  
   - FE: keep spinner; poll until terminal status (minimal).

5. **Compose / dist honesty**  
   - Document clearly: default `docker compose` = **dev** (bind-mount).  
   - Prod = compose + `docker-compose.prod.yml` only.  
   - Remove prod reliance on `ts-node/register` in `server.js` when running `dist`.  
   - Entrypoint in production: require non-empty `ENCRYPTION_KEY` (aligned with compose prod).  
   - Optional: warn/log if bind-mount and `dist` missing/stale (dev only).

**Exit P12:** registration gated in prod posture; tools not client-enableable on `/send`; reuse detection live; large upload does not hold HTTP until embeddings finish; prod boot refuses weak secrets + missing encryption key; tests green.

---

## 4. Phase P13 — Quality / UX

1. Convert Settings + ChatBox (and `useSettings`) toward TS; keep incremental if needed.  
2. RTL: Settings save smoke + ChatBox catalog/provider smoke.  
3. Cache “has embedding column” (once per process or TTL); improve no-embedding fallback ordering.  
4. Vision capability from catalog metadata (or explicit flag), not `gpt-4*` string heuristic.  
5. Tighten ESLint: re-enable `set-state-in-effect` where feasible; reduce `any`.

**Exit P13:** Settings/ChatBox covered by RTL; RAG probe not per-request; vision flag honest; lint stricter without blocking CI.

---

## 5. Phase P14 — Polish / scale

1. Collapse fake provider aliases to honest OpenAI/Ollama list (or labeled “via OpenAI”).  
2. JWT verify `algorithms: ['HS256']`; request-id middleware.  
3. Raise branch coverage floor (e.g. 60%+).  
4. Optional CI: `desktop` `electron-builder --dir` smoke (no GUI assert).

**Exit P14:** cleaner public surface; slightly stronger CI gates.

---

## 6. Suggested execution order

1. P12.1–12.3 (registration, chat options, refresh reuse) — pure security.  
2. P12.5 Compose/dist/ENCRYPTION_KEY — unblocks trustworthy deploys.  
3. P12.4 async ingest MVP.  
4. P13 then P14 as capacity allows.

Commit per task group; push only when asked. Ukrainian UI on touched surfaces.

---

## 7. Related docs

- Prior design: `docs/superpowers/specs/2026-08-08-project-evolution-v3-design.md`  
- Plan (gitignored): `docs/superpowers/plans/2026-08-08-project-evolution-v4.md`  
- Canvas: `project-evolution-v4-audit.canvas.tsx`
