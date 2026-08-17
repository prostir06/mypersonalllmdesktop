# npm audit baseline

**Recorded:** 2026-08-17 (v10 P40 close-out)  
**Policy:** Track known advisories; apply `npm audit fix` in a dedicated dependency PR when upgrades are verified against BE/FE/E2E tests.

## Backend (`backend/`)

| Package | Severity | Notes |
|---------|----------|-------|
| `body-parser` | low | DoS via invalid limit value — transitive via Express |
| `brace-expansion` | high | DoS via path expansion — dev (`nodemon`) + transitive |
| `fast-uri` | high | Host confusion via backslash — transitive |
| `js-yaml` | high | YAML parse DoS — transitive (dev/tooling) |

**Summary:** 4 vulnerabilities (1 low, 3 high). `npm audit fix` available.

## Frontend (`frontend/`)

| Package | Severity | Notes |
|---------|----------|-------|
| `nanoid` | high | Infinite loop on zero-size generator — transitive |
| `react-router` / `react-router-dom` | moderate | Open redirect + SSR hydration issues (6.x line) |

**Summary:** 3 vulnerabilities (2 moderate, 1 high). `npm audit fix` available.

## Verification

```bash
cd backend && npm audit
cd frontend && npm audit
```

Re-baseline after dependency bumps; do not treat green CI as a substitute for reviewing breaking changes in router/Express stacks.
