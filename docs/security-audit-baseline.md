# npm audit baseline

**Recorded:** 2026-08-19 (v11 P42, post-xlsx)  
**Policy:** CI fails on **new** high/critical GHSA IDs only. Known IDs live in `backend/scripts/audit-ci.cjs`. Frontend audit is recorded here and run in CI with `continue-on-error`. Do not `npm audit fix --force` (Prisma 6 / Electron major). Apply non-breaking `npm audit fix` in a dedicated PR after tests.

This is a **personal** single-user app. Untrusted multi-tenant workbook upload is out of scope; RAG still sniffs magic bytes before parse.

## Backend (`backend/`)

| Package | Severity | GHSA | Notes |
|---------|----------|------|-------|
| `body-parser` | low | GHSA-v422-hmwv-36x6 | Transitive via Express; below CI high threshold |
| `brace-expansion` | high | GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895 | Dev (`nodemon`) + transitive |
| `deepmerge-ts` | high | GHSA-ggr8-5vv4-36mx | Transitive via Prisma CLI; fix wants Prisma 6 |
| `fast-uri` | high | GHSA-7p8r-x3mc-p8w7 | Transitive |
| `js-yaml` | high | GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj | Transitive (dev/tooling) |
| `xlsx` | high | GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9 | SheetJS community `xlsx@0.18.5`: prototype pollution + ReDoS. **No fix.** Magic-byte check in `fileMagic.ts`; do not `eval` formulas |

**Summary:** 8 vulnerabilities (1 low, 7 high). `xlsx` has no patched community release.

**CI:** `npm run audit:ci` (allowlisted GHSAs above). Raw `npm audit --audit-level=high` **will fail** until SheetJS/Prisma/tooling upgrades.

## Frontend (`frontend/`)

| Package | Severity | Notes |
|---------|----------|-------|
| `nanoid` | high | Infinite loop on zero-size generator — transitive |
| `react-router` / `react-router-dom` | moderate | Open redirect + SSR hydration (6.x). App is CSR |

**Summary:** 3 vulnerabilities (2 moderate, 1 high).  
**CI:** `npm audit --audit-level=high` with `continue-on-error` (informational until router bump is verified).

## Desktop (`desktop/`)

electron / electron-builder / tar / extract-zip: multiple high + 1 critical (dev/packaging). Fixes are `--force` majors. Not gated in CI; re-check when bumping Electron.

## Verification

```bash
cd backend && npm audit && npm run audit:ci
cd frontend && npm audit
cd desktop && npm audit
```
