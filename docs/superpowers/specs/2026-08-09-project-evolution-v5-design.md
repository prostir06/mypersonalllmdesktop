# Project Evolution Roadmap v5 — Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Parent:** Supersedes “next” residual themes after P12–P14 delivery (`2026-08-08-project-evolution-v4-design.md`)  
**Scope:** Full-stack personal LLM control panel (`mypersonalllmdesktop`)  
**Approach:** User-approved **B** — security slice + early UX hotfix (`max_tokens`), then UX polish (P16), then quality/perf (P17)

---

## 1. Audit verdict (post P12–P14)

HEAD at design time: `e3025c0` (`ci(desktop): add electron-builder --dir pack smoke`) on `master`.

### Delivered in v4

| Phase | Outcome |
|-------|---------|
| **P12** | Registration gate; `/send` tools lock; refresh reuse → revoke-all; async document ingest (`pending`/`ready`/`failed`); prod `ENCRYPTION_KEY` + honest compose docs |
| **P13** | Settings/ChatBox/useSettings → TS + RTL; embedding-column probe cache; catalog `supports_vision`; ESLint hooks tighten |
| **P14** | Honest openai/ollama providers; JWT `algorithms: ['HS256']`; request-id middleware; branch coverage floor 60%; Electron `--dir` pack CI |

### Evidence (2026-08-09)

| Layer | Signal |
|-------|--------|
| Backend | ~199 tests; floors statements/lines/functions 80%, branches 60% |
| Frontend | ~36 tests; Settings + ChatBox RTL; `strict: true` |
| Desktop | Unit + `pack:ci` on Linux `--dir` |
| Docker | Dev compose bind-mount; prod overlay fail-closed |

### Architecture (as-is)

```
Browser / Electron
  → /api (Vite proxy | nginx | Electron uiServer)
  → Express (dist preferred; bind-mount may override in default compose)
       → Prisma + pgvector + FTS + refresh_tokens + openai_api_key_enc
       → requestId + HS256 JWT + registration gate
       → OpenAI / Ollama (honest catalog)
Postgres pgvector:pg15
```

### Residual findings (ranked)

| Severity | Finding | Evidence |
|----------|---------|----------|
| **High** | Refresh rotate TOCTOU (concurrent refresh can mint duplicate sessions) | `refreshTokens.rotateRefreshToken` |
| **High** | Upload keeps full `Buffer` + unbounded `setImmediate` jobs | `DocumentService.acceptUpload` |
| **High** | `options.image` unconstrained (size / remote URL) | `ChatService.prepareMessages` |
| **High (UX)** | Settings `max_tokens` never sent on chat stream | `useChatStream` options |
| **Med** | SSRF allowlist is hostname-string only (no post-DNS IP check) | `urlAllowlist` |
| **Med** | `/api/auth/refresh` outside `authLimiter` | `server.js` |
| **Med** | Tools forced off only at HTTP edge, not in `ChatService` | `openaiService` tools path |
| **Med** | Most 500 JSON bodies omit `requestId`; access log ignores `req.id` | controllers / logging middleware |
| **Med** | Chat UI still mostly JSX; ComponentType casts in ChatBox | `chat/*.jsx`, `Dashboard.jsx` |
| **Med** | Electron: no `will-navigate` lock / no CSP on uiServer | `desktop/src/main.ts`, `uiServer.ts` |
| **Med** | RAG: auto-select pending; weak failed UX; no ready toast | `useChatDocuments`, `DocumentModal` |
| **Low** | Dead provider enums in settings validator; Gravatar uses `btoa` | `settingsValidator.js`, `Profile.jsx` |
| **Low** | Bundle: Bootstrap always-on; framer-motion per message | FE deps / `MessageItem` |

**Verdict:** Auth fundamentals are solid. v5 should close **concurrency/DoS + image** risks, ship the **`max_tokens` hotfix early**, then polish UX and quality without rewriting the stack.

---

## 2. Goals for next cycle

| Horizon | Goal |
|---------|------|
| Immediate (**P15**) | Atomic refresh; image validation; upload concurrency/memory caps; refresh rate limit; tools defense-in-depth; **`max_tokens` in chat options** |
| Near (**P16**) | RAG pending/failed UX; vision flag in ModelCatalog; Electron CSP + nav lock; Profile Gravatar; trim dead provider validators |
| Mid (**P17**) | Finish critical JSX→TSX; propagate `requestId` on errors/logs; stronger RTL (Auth, docs poll); optional SSRF post-DNS; light bundle trim |

**Non-goals:** multi-tenant SaaS, billing, Tauri rewrite, new LLM brands without credentials, full stack rewrite, Redis/BullMQ unless personal-deploy pain forces it (prefer in-process semaphore first).

---

## 3. Phase P15 — Harden + UX hotfix

1. **Atomic refresh rotation**  
   - Rotate in a transaction / conditional `UPDATE … WHERE revoked_at IS NULL` so only one concurrent winner succeeds.  
   - Keep reuse → revoke-all. Tests for concurrent race (mocked or serialized assertions).

2. **Chat image options validation**  
   - Accept only `data:` image URLs (or allowlist + max decoded bytes).  
   - Reject oversized payloads with clear Ukrainian 400.  
   - Tests for reject paths.

3. **Upload DoS controls**  
   - Cap concurrent background finalize jobs per process (semaphore).  
   - Prefer not retaining giant buffers longer than needed; document limits in README/`.env.example`.  
   - In-process queue is enough for personal deploy (no BullMQ required in P15).

4. **Auth rate limit on `/refresh`**  
   - Apply `authLimiter` (or dedicated slightly higher limit) to refresh.

5. **Defense-in-depth: `enableTools: false`** inside `ChatService` / provider send path regardless of client.

6. **UX hotfix: pass `max_tokens`** from settings into `useChatStream` / chat options (and keep Settings save as source of truth).

**Exit P15:** refresh race closed; image/upload abuse bounded; tools not re-enableable via service; chat respects `max_tokens`; tests green.

---

## 4. Phase P16 — Product / UX polish

1. RAG: do not auto-select `pending`; show failed reason; toast when status → `ready`.  
2. ModelCatalog: create/edit `supports_vision` (or derive-only display if API already computes). Prefer editable override only if schema allows; otherwise show server flag read-only + docs.  
3. Electron: deny unexpected navigation; add baseline CSP headers on `uiServer`.  
4. Fix Profile Gravatar (proper MD5 email hash).  
5. Remove dead provider names from `settingsValidator` / align with openai|ollama only.

**Exit P16:** RAG status UX trustworthy; desktop shell harder to navigate-off; Gravatar correct; validators honest.

---

## 5. Phase P17 — Quality / optimization

1. Convert remaining high-traffic JSX (`Dashboard`, chat presentational, Login/Register/Navigation) toward TSX; drop ChatBox `ComponentType` casts where possible.  
2. Propagate `req.id` into access logs and standardized error JSON (or route more errors through `errorHandler`).  
3. RTL: AuthContext/refresh interceptor smoke; `useChatDocuments` poll/select rules; less mock-only ChatBox coverage where cheap.  
4. Optional: post-DNS private-IP rejection in `urlAllowlist` (Med SSRF).  
5. Light perf: reduce/remove per-message `framer-motion` or gate behind preference; consider vendor `manualChunks` if build report shows wins.

**Exit P17:** stricter typing on chat path; observable request ids; better FE regression net; optional SSRF deepen; no large dependency rewrite.

---

## 6. Suggested execution order

1. P15.1–15.5 security controls (atomic refresh, image, upload caps, refresh limiter, tools depth).  
2. P15.6 `max_tokens` hotfix (same phase, early commit OK).  
3. P16 UX/desktop polish.  
4. P17 quality/optimization as capacity allows.

Commit per task group; push only when asked. Ukrainian UI on touched surfaces. Prefer TDD for security/correctness.

---

## 7. Related docs

- Prior design: `docs/superpowers/specs/2026-08-08-project-evolution-v4-design.md`  
- Plan (gitignored under plans): `docs/superpowers/plans/2026-08-09-project-evolution-v5.md` (after approval)  
- Canvas: `project-evolution-v5-audit.canvas.tsx`
