# npm audit baseline

**Recorded:** 2026-11-07 (v19 W5, commit `6915e09`)  
**Policy:** CI fails on a high or critical advisory that is not in the allowlist. Do not run `npm audit fix --force`. Zod 4, Electron builder majors, React 19, and Express 5 stay on the v20 list.

The deployment is a small trusted team on one server.

## Backend (`backend/`)

| Severity | Count |
|----------|-------|
| critical | 0 |
| high | 0 |
| moderate | 17 |
| low | 7 |

`npm run audit:ci` allows no high/critical GHSA (`ALLOWED_GHSA` is empty).

`xlsx` was replaced with `exceljs` on 2026-10-30 (`GHSA-4r6h-8v6p-xvw6`, `GHSA-5pgg-2g8v-p4x9`).

## Frontend (`frontend/`)

| Severity | Count |
|----------|-------|
| critical | 0 |
| high | 1 |
| moderate | 10 |
| low | 0 |

| Package | GHSA | Notes |
|---------|------|-------|
| `zod` | `GHSA-mrhx-c7xc-m3w5` | Allowlisted in `scripts/audit-allowlists/frontend.json`. The fix is zod 4, which is deferred. |

CI runs `npm run audit:ci` and fails on any other high or critical id.

## Desktop (`desktop/`)

Full tree (`npm audit`): 1 critical, 14 high, 5 moderate. Those ids are allowlisted in `scripts/audit-allowlists/desktop.json` (electron-builder packaging tree, including `tar`, plus `js-yaml`).

Production tree (`npm audit --omit=dev`): 1 high, `js-yaml` `GHSA-2883-xcg3-v3hh`, via `electron-updater`.

CI runs `npm run audit:ci` on the full tree and fails on any id outside that file.

## Verification

```bash
cd backend && npm run audit:ci
cd frontend && npm run audit:ci
cd desktop && npm run audit:ci
```
