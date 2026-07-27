# Frontend Vite Migration — Minimal Typed API Layer

## Overview

Finish the frontend move from Create React App to Vite with **minimal TypeScript**: type the API boundary only. UI components stay `.jsx`. No Vitest, no `strict: true`, no component-wide `.tsx` conversion.

## Goals

- Vite `dev` and `build` work reliably.
- Central API client is TypeScript with request/response DTOs.
- Remove CRA leftovers (`REACT_APP_*`, `package.json` `proxy`, CRA `eslintConfig`).
- Keep existing UI behavior (auth refresh, toasts, SSE streaming).

## Out of Scope

- Converting pages/components/hooks/context to `.tsx`
- Enabling `compilerOptions.strict`
- Restoring or migrating tests to Vitest
- UI redesign; Tailwind/framer-motion/lucide cleanup unless they block build
- Backend changes

## Architecture

```
UI (.jsx) → services/api.ts → Axios / fetch → Backend /api
                 ↑
          types/api.ts
```

Components keep importing `authAPI`, `chatAPI`, `conversationAPI`, `modelsAPI`, `documentsAPI`, `usersAPI`, `settingsAPI` from `./services/api` (or existing relative paths). Only the API module implementation and types change.

### File changes

| Action | Path |
|--------|------|
| Create | `frontend/src/types/api.ts` — DTOs and stream event unions |
| Rename + type | `frontend/src/services/api.js` → `api.ts` |
| Keep | `frontend/src/index.tsx`, `App.tsx`, all `.jsx` components |
| Update | `frontend/.env.example` with `VITE_API_URL`; Vite config only if needed |
| Cleanup | `frontend/package.json` — remove CRA `proxy`, `eslintConfig` extending `react-app`, other dead CRA fields |

## Environment

```ts
const API_URL = import.meta.env.VITE_API_URL || '/api';
```

- **Dev:** Vite proxy `/api` → `http://localhost:5000` (already in `vite.config.js`).
- **Prod:** set `VITE_API_URL` or rely on same-origin `/api`.
- No remaining `process.env.REACT_APP_*` in frontend source.

## API Typing

- Each API method: explicit parameter types and `Promise<AxiosResponse<T>>` (or equivalent typed return matching current usage).
- SSE `streamMessage`: typed callbacks `onToken`, `onInit`; parsed payloads as a discriminated union (`type: 'init' | 'token'`).
- Prefer optional fields / `unknown` over `any` where the backend shape is incomplete.
- Types are derived from the current `api.js` surface and known backend contracts; they are not generated from OpenAPI in this phase.

## Data Flow

1. UI calls the same API helpers as today.
2. Request interceptor attaches Bearer token from `localStorage`.
3. On 401: refresh queue + retry queued requests (same runtime logic as current `api.js`).
4. Streaming uses `fetch` + SSE line parsing; only event payloads and callbacks are newly typed.

## Error Handling

- Runtime behavior unchanged: toast on session expiry, redirect to `/login` when appropriate, Axios/stream errors propagate as today.
- No new typed error hierarchy in this scope. Types focus on successful response shapes.

## Implementation Order

1. Switch env usage to `import.meta.env.VITE_*`; confirm proxy / `index.html` entry.
2. Add `src/types/api.ts`.
3. Migrate `api.js` → `api.ts` with typed methods.
4. Remove CRA leftovers from `package.json` (and related dead files if any).
5. Verify `npm run start` and `npm run build`; smoke login/chat against backend.

## Done Criteria

- [ ] `npm run start` serves on port 3000 with working `/api` proxy
- [ ] `npm run build` succeeds
- [ ] No `process.env.REACT_APP_*` in frontend
- [ ] No CRA `proxy` / `eslintConfig: react-app` in `package.json`
- [ ] `api.ts` and `types/api.ts` exist; existing UI imports still resolve

Non-blocking: failing or un-run tests; `strict: false`.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Wrong prod API base URL | `.env.example` + default `'/api'` |
| DTOs drift from backend | Types from current client + smoke login/chat |
| Extra deps break build | Touch only if build fails |
| Old tests red | Explicitly out of scope |

## Approach Rationale

Chosen: **typed API layer** (`api.ts` + `types/api.ts`) over JSDoc-only overlays or a temporary facade wrapping `api.js`. Gives real compile-time checks at the network boundary with a small, reviewable diff while leaving the `.jsx` UI alone.
