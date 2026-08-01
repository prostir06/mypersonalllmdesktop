# Frontend Vite — Finish WIP + Cleanup

## Overview

Close the uncommitted CRA→Vite migration that already largely matches `2026-07-27-frontend-vite-ts-minimal-design.md`: confirm typed API + Vite build, fix remaining CRA env usage, delete orphaned Jest tests, and remove unused frontend dependencies. Ship as one clean commit (no Vitest, no strict TS, no UI `.tsx` conversion).

## Goals

- Verify and lock done criteria from the 2026-07-27 minimal Vite/typed-API spec
- Fix `ErrorBoundary.jsx` to use `import.meta.env.DEV` instead of `process.env.NODE_ENV`
- Delete `frontend/src/__tests__/**` and `frontend/src/setupTests.js`
- Remove unused deps: `tailwindcss`, `postcss`, `autoprefixer`, `lucide-react`, `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`
- Keep `framer-motion` (used by `MessageItem.jsx`)
- Commit the full frontend WIP (`.jsx` renames, `api.ts` / `types/api.ts`, Vite entrypoints) in one commit
- Do not commit secrets (`.env` stays local / gitignored)

## Out of Scope

- Adding Vitest or restoring unit tests
- Enabling `compilerOptions.strict`
- Converting pages/components/hooks to `.tsx`
- UI redesign; removing Bootstrap / framer-motion
- Backend changes
- Chat or other unfinished backend modules

## Relationship to Prior Spec

This slice **extends** `docs/superpowers/specs/2026-07-27-frontend-vite-ts-minimal-design.md`. Architecture remains:

```
UI (.jsx) → services/api.ts → Axios / fetch → Backend /api
                 ↑
          types/api.ts
```

Already present in the working tree (to be verified, not rewritten unless broken):

- `frontend/vite.config.js`, `frontend/index.html`, `src/index.tsx`, `src/App.tsx`
- `src/services/api.ts`, `src/types/api.ts`, `src/vite-env.d.ts`
- UI renamed to `.jsx`; CRA `proxy` / `react-scripts` already absent from scripts

## Cleanup Actions

| Action | Path / item |
|--------|-------------|
| Fix | `src/components/ErrorBoundary.jsx` — `import.meta.env.DEV` |
| Delete | `src/__tests__/` (all files) |
| Delete | `src/setupTests.js` |
| Delete (if still present) | any leftover CRA `.js` entry duplicates already replaced by `.jsx`/`.tsx` |
| `npm uninstall` | unused deps listed in Goals |
| Keep | `framer-motion`, Vite, TypeScript, React Testing not re-added |
| Stage + commit | entire intentional frontend WIP (not `.env`) |

## Environment

- `VITE_API_URL` via `import.meta.env` (already in `.env.example` / `vite-env.d.ts`)
- Dev proxy `/api` → backend remains as in `vite.config.js`
- No `process.env.REACT_APP_*` and no `process.env.NODE_ENV` in `src/`

## Verification

Run from `frontend/`:

1. `rg "REACT_APP_|process\\.env" src` — no matches
2. `npx tsc --noEmit` — exit 0
3. `npm run build` — success
4. Confirm `__tests__` and `setupTests.js` gone
5. Confirm removed packages absent from `package.json`
6. Optional smoke: `npm run start` + login against backend

No unit-test gate in this slice.

## Error Handling / Runtime

Unchanged from the 2026-07-27 spec: auth refresh, toasts, SSE streaming behavior stay as in current `api.ts`. Cleanup must not alter API client logic except for env/dev flag fix.

## Implementation Order

1. Fix `ErrorBoundary` env check
2. Delete tests + `setupTests.js`
3. Uninstall unused deps; refresh lockfile
4. Grep + `tsc` + `build` verification
5. Single git commit of frontend WIP (+ this spec already committed separately)

## Done Criteria

- [ ] `npm run build` succeeds
- [ ] `npx tsc --noEmit` succeeds
- [ ] No `process.env` / `REACT_APP_` in `frontend/src`
- [ ] No `__tests__` or `setupTests.js`
- [ ] Unused deps removed; `framer-motion` kept
- [ ] Frontend WIP committed on `master` (or agreed branch); `.env` not committed
- [ ] Typed API files remain: `api.ts`, `types/api.ts`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Accidental commit of `.env` | Stage paths explicitly; never `git add frontend/.env` |
| Removing a dep that is imported | Grep before uninstall; keep framer-motion |
| Huge rename commit hard to review | One commit is intentional; message documents Vite finish + cleanup |
| Tests wanted later | Vitest = separate brainstorm/spec |

## Approach Rationale

Chosen: **verify existing Vite/typed-API work + delete orphan Jest/tests + prune unused deps + one commit**, rather than rewriting the 2026-07-27 architecture or splitting into multiple feature branches. Fastest path to a clean, buildable frontend tree.
