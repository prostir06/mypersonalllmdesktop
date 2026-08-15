# Task 12 Report

## STATUS
Implemented the remaining `requestId` sweep for JSON auth errors, then fixed the compose frontend build to always bake relative `/api`. P36 e2e gate is now green.

## FILES
- `docker-compose.yml`
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

docker compose up -d --build frontend

# confirm served asset bakes relative /api
$index = (Invoke-WebRequest -UseBasicParsing http://localhost:3000/).Content
$asset = ([regex]::Match($index,'/assets/api-[^" ]+\.js')).Value
$js = (Invoke-WebRequest -UseBasicParsing ('http://localhost:3000' + $asset)).Content

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
- Compose frontend asset proof after the docker fix:
  - served asset: `ASSET=/assets/api-D8Dy01UA.js`
  - asset check returned `NO_LOCALHOST_5000`
  - asset check returned `HAS_RELATIVE_API`
- E2E gate:
  - `npm test` in `e2e/` passed `4/4` specs
  - `conversation-query.spec.ts` passed
  - `login.spec.ts` passed
  - `rag-upload.spec.ts` passed
  - `smoke.spec.ts` passed

## Self-Review
- Kept the code change minimal: only swapped the two remaining auth `401` JSON responses to `jsonError(...)`.
- Added regression coverage for both missing-token and invalid-token branches so the requestId contract is enforced.
- Kept the compose fix to one line by hardcoding frontend build arg `VITE_API_URL: /api`, which removes host `.env` leakage into the nginx bundle.
