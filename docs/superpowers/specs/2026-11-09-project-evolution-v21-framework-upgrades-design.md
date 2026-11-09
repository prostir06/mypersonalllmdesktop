# Project Evolution v21 — Framework Upgrades

**Date:** 2026-11-09  
**Status:** Design approved — awaiting spec review before the implementation plan  
**Parent:** Post v20 (code optimization and `.docx` artifacts), commit `679fd99`  
**Target:** Small trusted team (2–10) on the existing Docker Compose stack  
**Scope:** Three shippable waves. No new chat behavior, no UI copy changes.

| Wave | Tag | Upgrade | Packages |
|------|-----|---------|----------|
| W1 | v21.0 | TypeScript `7.0.2` exactly | `backend`, `frontend`, `desktop`, `e2e` |
| W2 | v21.1 | Express `5.3.0` exactly, plus matching `@types/express` | `backend` |
| W3 | v21.2 | React and React DOM `19.3.1` exactly, `@types/react` and `@types/react-dom` 19 | `frontend` |

**Non-goals:**

- Jest 30. Backend stays on Jest 29.
- `openai` 7 and `@google/genai` 3. Provider SDKs stay on their current majors (`openai` ^6, `@google/genai` ^2).
- Prisma 8 while it is a release candidate. On 2026-11-09 the published line is `8.0.0-rc.*`, and that line still lacks Prisma 7 APIs this app uses (`$extends`, nested writes, `P2002` codes).
- Electron signing, auto-update, i18n, MCP, vector memory, Redis.
- Rewriting `forwardRef` in `DashboardSidebar` to the React 19 `ref` prop.
- Loosening `strict` or changing `target` / `module` / `skipLibCheck` unless TypeScript 7.0 rejects a flag. A rejected flag is replaced with the equivalent from the 7.0 release notes.

## 1. Order and stop rule

W1, then W2, then W3. A wave merges only when its gate is green. A red gate that is not fixed by a type change, a peer-compatible dependency bump inside the rule below, or a one-line bugfix stops that wave. Later waves do not start. Rollback is a revert of that wave's commits. Earlier green waves stay.

## 2. W1 — TypeScript 7.0.2

Pin `typescript@7.0.2` in `backend/package.json`, `frontend/package.json`, `desktop/package.json`, and `e2e/package.json`. Do not install `7.1.0-beta` or `7.1.0-dev`.

Compiler errors are fixed with types. Runtime logic changes only when the error shows a real bug.

**Gate:**

- `backend`: `tsc -p tsconfig.json` and `npm test`.
- `frontend`: `npm run typecheck`, `npm test`, `npm run build`, `npm run check:bundle` (initial JS gzip ≤ 350 KB).
- `desktop`: `npm test`.
- `e2e`: `npm run typecheck`.
- Docker backend image builds, because its Dockerfile runs `tsc`.

## 3. W2 — Express 5.3.0

Pin `express@5.3.0`. Install the `@types/express` release that matches Express 5.

Route paths stay as they are. The tree has no `app.del`, no `req.param()`, and no `/*` wildcard. Do not rename handlers.

A rejected promise or thrown error in an async handler must reach the existing `errorHandler` and keep the current JSON error shape. If the upgrade does not already do that, add one test: an async handler that throws returns 500 through `errorHandler`. Do not invent a new error body.

**Gate:** `backend` `npm test`, and `GET /api/health` returns `{"status":"OK","db":"ok"}` from a rebuilt `docker compose` backend.

## 4. W3 — React 19.3.1

Pin `react@19.3.1` and `react-dom@19.3.1`. Bump `@types/react` and `@types/react-dom` to 19. `createRoot` and `StrictMode` in `frontend/src/index.tsx` stay. Theme and Ukrainian copy stay.

`@testing-library/react` ^16.3.2 stays. If `react-bootstrap@2.10` does not accept React 19 as a peer, bump `react-bootstrap` to the lowest 2.x release that declares that peer. Do not move to react-bootstrap 3.

**Gate:** frontend unit tests, production build, initial JS gzip ≤ 350 KB, rebuilt frontend image, then Playwright `e2e/login.spec.ts` and `e2e/docx-artifact.spec.ts` against that image.

## 5. Prisma 8 hold

Stay on Prisma ^7.9, the current schema, the current migrations, and `backend/src/generated/prisma`.

v21.3 starts only when `npm view prisma version` prints `8.0.0` or a later stable `8.x` with no `-rc`, `-beta`, or `-dev`. That check is the entry condition for a later spec. It is not a task in the v21.0–v21.2 plan.

## 6. Testing

Each wave's gate is the test list in its section. Do not require the full Playwright suite for W1 or W2. W3 runs only `login.spec.ts` and `docx-artifact.spec.ts`. Nightly CI may still run the rest.
