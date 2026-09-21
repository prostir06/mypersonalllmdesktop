# Code Quality v13 — Thin Controllers + FE Split

**Date:** 2026-09-21  
**Status:** Approved design (awaiting implementation plan)  
**Parent:** Post-P0 SLI closeout; continues hygiene thread from v12 (P44–P46)  
**Scope:** Full hygiene — all BE controllers >180 LOC + all FE production files >300 LOC  
**Approach:** Surgical extract (A) — no layer rewrite, no behavior/API/UX changes  
**Horizon:** One gated wave, single PR preferred (atomic commits per file/pair)

**Non-goals:** new features; API/SSE contract changes; auth/other controllers already ≤180; FE files <300 (`Settings`, `MessageItem`, etc.); test files >300; ESLint `max-lines` hard-fail; Redis/BullMQ; RAG/perf work

---

## 1. Goals & success criteria

**Goal:** thinner HTTP adapters and FE modules under hard LOC gates, without changing behavior, public API shapes, or UX.

### Targets (baseline 2026-09-21)

| Layer | File | LOC (approx) | Gate |
|-------|------|--------------|------|
| BE | `backend/src/controllers/chatController.ts` | 227 | ≤180 |
| BE | `backend/src/controllers/documentsController.ts` | 225 | ≤180 |
| BE | `backend/src/controllers/settingsController.ts` | 196 | ≤180 |
| FE | `frontend/src/components/PromptLibraryModal.tsx` | 340 | ≤300 |
| FE | `frontend/src/components/chat/DocumentModal.tsx` | 327 | ≤300 |
| FE | `frontend/src/components/settings/ModelCatalog.tsx` | 321 | ≤300 |
| FE | `frontend/src/components/ChatBoxOptimized.tsx` | 307 | ≤300 |
| FE | `frontend/src/hooks/useChatStream.ts` | 306 | ≤300 |
| FE | `frontend/src/pages/Dashboard.tsx` | 304 | ≤300 |

**Done when:**
1. Every target file is under its gate (physical line count).
2. Existing BE/FE unit suites and relevant smoke e2e stay green.
3. Public routes, status codes, JSON/SSE payloads, and FE public props/exports have no breaking changes.
4. Production error responses still do not leak internals.

---

## 2. Approach

**Surgical extract:** move orchestration and helpers out of thick files into existing or small new modules along clear seams. Prefer extending `ChatService` / `DocumentService` and colocated FE folders over inventing a new architecture.

**Rejected:**
- **B Layer rewrite** — high blast radius (handler factories / feature folders everywhere).
- **C Lint-first only** — does not close full hygiene in this wave.

Optional follow-up (out of wave): soft ESLint `max-lines` warning — not required to close v13.

---

## 3. Backend design

**Rule:** controller = validate/parse → service call → HTTP/SSE map + status. Prisma, crypto, domain rules live in services/utils.

| Controller | Extract | Destination |
|------------|---------|-------------|
| `chatController` | `writeSse`, `validateChatMessage`, `publicErrorJson` / `publicStreamErrorText`, shared abort/SSE error mapping | `utils/sse.ts` and/or `utils/httpErrors.ts` (or `services/chat/httpHelpers.ts`); handlers stay thin over `ChatService` |
| `documentsController` | `publicUploadError`, upload/reindex/retry status mapping (size limits, `UrlNotAllowed`, not found) | `services/documents/httpErrors.ts` (or similar); keep calling `DocumentService` |
| `settingsController` | `defaultSettings`, `toPublicSettingsAsync`, `toSettingsRow`, encrypt/update body parsing, embedding-cache invalidate | new `services/settingsService.ts`; controller only GET/PUT |

**Invariants:**
- Routes, status codes, and response bodies unchanged.
- Rate limits remain in `server` / middleware.
- Production never returns internal exception details.

**BE order:** settings → documents → chat (SSE last).

---

## 4. Frontend design

**Rule:** split along seams (data hooks / section components / pure helpers). No UX redesign. Public component props and hook return shapes stay stable for existing callers.

| File | Split |
|------|-------|
| `PromptLibraryModal` | `PRESET_PROMPTS` → `promptPresets.ts`; list/form → `PromptLibraryList` / `PromptLibraryForm` and/or `usePromptLibrary` |
| `DocumentModal` | `RagModeBadge`, `ChunkPreview`, `fileKindLabel` → `components/chat/documentModal/*`; thin modal shell |
| `ModelCatalog` | form/CRUD state → `useModelCatalog`; table/form → `ModelCatalogTable` / `ModelCatalogForm` |
| `ChatBoxOptimized` | input/toolbar/list wiring → `ChatBoxInput` + local `chat/` subcomponents or `useChatBoxUi` |
| `useChatStream` | parse/retry/abort helpers → `chatStreamHelpers.ts`; hook keeps orchestration only |
| `Dashboard` | layout chunks → `DashboardSidebar` / `DashboardHeader`; selection logic in page or `useDashboard` |

**Out of FE scope:** tests >300 LOC; `Settings.tsx` (~232); `types/api.ts`.

**FE order:** PromptLibrary → DocumentModal → ModelCatalog → Dashboard → ChatBox → `useChatStream` (SSE last).

**Import hygiene:** colocate under `documentModal/`, `settings/`, `chat/` to avoid cycles.

---

## 5. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| SSE regression (`chatController` / `useChatStream`) | Extract helpers only; touch stream path last; smoke stream |
| Settings encrypt / public JSON shape drift | Keep key names; unit coverage on `toPublic*` / update path |
| FE import cycles after split | Colocate; prefer named exports from local folders |
| Fake LOC wins (pointless wrappers) | Extract real logic only; no single-line re-export spam |

---

## 6. Test plan

Per commit / before merge:
1. BE: existing unit suites for settings/documents/chat (+ any new service unit if extracted pure helpers warrant it).
2. FE: unit tests for touched hooks/components.
3. Manual smoke: document upload, prompt library, model catalog CRUD, dashboard nav, chat stream.
4. LOC gate: recount all target files; all under thresholds.

No DB migrations. No feature flags.

---

## 7. Rollout

- Default: **one PR**, atomic commits (one controller or one FE file/pair per commit).
- Acceptable alternative: two PRs (BE then FE) if review load is high — same gates.
- Commit only hygiene files; leave unrelated dirty docs alone.

---

## 8. Open follow-ups (explicitly not v13)

- Soft/hard ESLint `max-lines` in CI.
- Thinning files that are close but under gate (`Settings`, `useChatDocuments`, etc.).
- Broader folder reorg or use-case layer.
