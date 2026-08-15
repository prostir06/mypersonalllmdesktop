# Task 12 Report

## STATUS
Implemented the remaining `requestId` sweep for JSON auth errors and committed the code. P36 gate is only partially green because Playwright e2e currently fails on auth flows after successful user registration.

## FILES
- `backend/src/middleware/auth.ts`
- `backend/src/__tests__/authMiddleware.test.js`
- `.superpowers/sdd/task-12-report.md`

## SHA
`ef13dcb6076d72636efede1e7a9ad48e994ee823` (`fix(api): ensure requestId on remaining JSON errors`)

## COMMANDS
```powershell
cd backend
rg "res\.status\([0-9]+\)\.json\(\{\s*error" src

cd backend
npm test -- authMiddleware.test.js

cd backend
npm test

cd frontend
npm test

cd ..
docker compose up -d --build
docker compose ps
curl.exe -s http://localhost:5000/api/health
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/

cd e2e
npm test
```

## P36 Gate Evidence
- Backend targeted regression: `npm test -- authMiddleware.test.js` failed first because `requestId` was missing, then passed after the fix (`4/4` tests passed).
- Backend full suite: `npm test` passed on rerun (`39` suites, `271` tests).
- Frontend full suite: `npm test` passed (`26` files, `64` tests).
- Compose gate: `docker compose ps` showed `backend`, `frontend`, and `postgres` all `healthy`.
- Health checks:
  - `GET http://localhost:5000/api/health` returned `{"status":"OK",...,"database":{"status":"ok"}}`
  - `GET http://localhost:3000/` returned HTTP `200`
- E2E gate:
  - `npm test` in `e2e/` failed `4/4` specs
  - `login.spec.ts`, `conversation-query.spec.ts`, and `rag-upload.spec.ts` stalled on `http://localhost:3000/login`
  - `smoke.spec.ts` stalled on `http://localhost:3000/register`
  - Backend logs show successful `POST /api/auth/register` requests and created users during the same run, so the failing gate is in login/register flow after registration rather than in requestId handling

## Self-Review
- Kept the code change minimal: only swapped the two remaining auth `401` JSON responses to `jsonError(...)`.
- Added regression coverage for both missing-token and invalid-token branches so the requestId contract is enforced.
- Did not touch unrelated controller code because the brief's controller grep returned no `error` offenders; the only remaining raw JSON error responses were in `auth` middleware.
