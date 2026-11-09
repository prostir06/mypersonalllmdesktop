# Project Evolution v21 — Framework Upgrades

**Date:** 2026-11-09  
**Status:** Implemented (v21.1 Express 5.3.0, v21.2 React 19.3.1). TypeScript 7 stays parked until ts-jest accepts its compiler API. Prisma 8 is not part of this release.  
**Parent:** Post v20 (code optimization and `.docx` artifacts), commit `679fd99`  
**Target:** Small trusted team (2–10) on the existing Docker Compose stack  
**Scope:** Two shippable waves. TypeScript 7 stays on the current 5.x line. No new chat behavior, no UI copy changes.

| Wave | Tag | Upgrade | Packages |
|------|-----|---------|----------|
| W1 | v21.0 | Parked. TypeScript stays `^5.6.0` | — |
| W2 | v21.1 | Express `5.3.0` exactly, plus `@types/express@5.0.6` | `backend` |
| W3 | v21.2 | React and React DOM `19.3.1` exactly, `@types/react` and `@types/react-dom` `19.3.0` | `frontend` |

**Non-goals:**

- Jest 30. Backend stays on Jest 29.
- `openai` 7 and `@google/genai` 3. Provider SDKs stay on their current majors (`openai` ^6, `@google/genai` ^2).
- Prisma 8 while it is a release candidate. On 2026-11-09 the published line is `8.0.0-rc.*`, and that line still lacks Prisma 7 APIs this app uses (`$extends`, nested writes, `P2002` codes).
- Electron signing, auto-update, i18n, MCP, vector memory, Redis.
- Rewriting `forwardRef` in `DashboardSidebar` to the React 19 `ref` prop.
- TypeScript 7 until `ts-jest` can load its compiler API. Do not install `typescript@7`, `7.1.0-beta`, or `7.1.0-dev`.
- Loosening `strict` or changing `target` / `module` / `skipLibCheck`.

## 1. Order and stop rule

W2, then W3. W1 does not start. A wave merges only when its gate is green. A red gate that is not fixed by a type change, the react-bootstrap peer bump in §4, or a one-line bugfix stops that wave. The later wave does not start. Rollback is a revert of that wave's commits. An earlier green wave stays.

## 2. W1 — TypeScript 7 hold

On 2026-11-09, `tsc -p tsconfig.json` with `typescript@7.0.2` exited 0 on the backend. `npm test` did not run: `ts-jest@29.4.15` peers `typescript >=4.3 <7` and rejects 7.0.2 because `createLanguageService`, `parseJsonConfigFileContent`, and `transpileModule` are absent. `@typescript/native` is not on the npm registry. `@typescript/typescript6@6.0.2` exists and was not adopted.

Stay on `typescript` `^5.6.0` in `backend`, `frontend`, `desktop`, and `e2e`. v21.0 starts only in a later spec, when a `ts-jest` release that stays on Jest 29 accepts `typescript@7`. That check is not a task in this plan.

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

Each wave's gate is the test list in its section. W2 does not run Playwright. W3 runs only `login.spec.ts` and `docx-artifact.spec.ts`. Nightly CI may still run the rest.
