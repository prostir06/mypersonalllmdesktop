# npm audit baseline

**Recorded:** 2026-09-22 (post non-breaking `npm audit fix`)  
**Policy:** CI fails on **new** high/critical GHSA IDs only. Known IDs live in `backend/scripts/audit-ci.cjs`. Frontend audit is recorded here and run in CI with `continue-on-error`. Do not `npm audit fix --force` (Prisma 6 / Electron major). Apply non-breaking `npm audit fix` in a dedicated PR after tests.

This is a **personal** single-user app. Untrusted multi-tenant workbook upload is out of scope; RAG still sniffs magic bytes before parse.

## Backend (`backend/`)

| Package | Severity | GHSA | Notes |
|---------|----------|------|-------|
| `deepmerge-ts` | high | GHSA-ggr8-5vv4-36mx | Transitive via Prisma CLI; fix wants Prisma 6 major |
| `mysql2` | high | GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3 | Transitive via Prisma CLI; fix wants Prisma 6 major |
| `xlsx` | high | GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9 | SheetJS community `xlsx@0.18.5`: prototype pollution + ReDoS. **No fix.** Magic-byte check in `fileMagic.ts`; do not `eval` formulas |

**Cleared by `npm audit fix` (2026-09-22):** `brace-expansion`, `browserslist`, `fast-uri`, `js-yaml`, `@xmldom/xmldom` (and related transitive highs).

**CI:** `npm run audit:ci` (allowlisted GHSAs above). Raw `npm audit --audit-level=high` **will fail** until SheetJS/Prisma upgrades.

## Frontend (`frontend/`)

| Package | Severity | Notes |
|---------|----------|-------|
| `nanoid` | high | Infinite loop on zero-size generator — transitive |
| `react-router` / `react-router-dom` | moderate | Open redirect + SSR hydration (6.x). App is CSR |

**Summary:** informational in CI (`continue-on-error`).  
**CI:** `npm audit --audit-level=high` with `continue-on-error` (until router bump is verified).

## Desktop (`desktop/`)

electron / electron-builder / tar / extract-zip: multiple high + 1 critical (dev/packaging). Fixes are `--force` majors. Not gated in CI; re-check when bumping Electron.

## Verification

```bash
cd backend && npm audit && npm run audit:ci
cd frontend && npm audit
cd desktop && npm audit
```
