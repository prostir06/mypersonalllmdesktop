# npm audit baseline

**Recorded:** 2026-10-27 (v15 wave 2 — non-breaking `npm audit fix` + vite 8.3.5); updated 2026-10-30 (v16 wave 1 — replaced xlsx with exceljs)  
**Policy:** CI fails on **new** high/critical GHSA IDs only (backend `audit:ci`). Frontend audit is recorded here and run in CI with `continue-on-error`. Do not `npm audit fix --force` (vitest 5 / react-router 7 / Electron majors). Apply non-breaking `npm audit fix` in a dedicated PR after tests.

This is a **personal** single-user app. Untrusted multi-tenant workbook upload is out of scope; RAG still sniffs magic bytes before parse.

## Backend (`backend/`)

| Package | Severity | GHSA | Notes |
|---------|----------|------|-------|
| *(none)* | — | — | 0 high/critical vulnerabilities |

**Cleared (2026-10-30 - v16 wave 1):** Replaced SheetJS `xlsx` with `exceljs` (`GHSA-4r6h-8v6p-xvw6`, `GHSA-5pgg-2g8v-p4x9` eliminated). Backend has 0 high/critical vulnerabilities. `ALLOWED_GHSA` in `audit-ci.cjs` is empty.

**Cleared (2026-10-27):** Prisma CLI transitive highs (`deepmerge-ts`, `mysql2`) no longer reported after lockfile refresh.

**Cleared earlier (2026-09-22):** `brace-expansion`, `browserslist`, `fast-uri`, `js-yaml`, `@xmldom/xmldom` (and related transitive highs).

**CI:** `npm run audit:ci` (`ALLOWED_GHSA` empty; zero high/critical advisories allowed).

## Frontend (`frontend/`)

| Package | Severity | Notes |
|---------|----------|-------|
| `tinypool` (via `vitest`) | critical | Prototype pollution → RCE in worker options. Fix wants `vitest@5` (`--force`) |
| `@vitest/mocker` / `vitest` | moderate | Path traversal / mock injection — same vitest 5 bump |
| `react-router` / `react-router-dom` | moderate | Open redirect + SSR hydration (6.x). App is CSR. Fix wants v7 major |

**Cleared (2026-10-27):** `vite` high advisories via bump to `8.3.5` (non-breaking within v8). Prior `nanoid` high no longer reported.

**Summary:** informational in CI (`continue-on-error`).  
**CI:** `npm audit --audit-level=high` with `continue-on-error` (until vitest/router majors verified).

## Desktop (`desktop/`)

electron / electron-builder / tar / extract-zip: multiple high + 1 critical (dev/packaging). Fixes are `--force` majors. Not gated in CI; re-check when bumping Electron.

## Verification

```bash
cd backend && npm audit && npm run audit:ci
cd frontend && npm audit
cd desktop && npm audit
```
