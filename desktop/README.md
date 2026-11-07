# Desktop (Electron)

Windows-first Electron shell for the Vite frontend. The Express API and Postgres stay external.

## Prerequisites

- Node 22.22+ or 24+ (Node 24 LTS recommended)
- Backend running (e.g. `cd backend && npm run dev` or Docker Compose)
- For **dev**: frontend Vite on port 3000 (`cd frontend && npm start`)
- For **packaged / prod-like**: `cd frontend && npm run build` (UI copied into the installer as `resources/ui`)

## Install

```bash
cd desktop
npm install
```

## Dev (loads Vite)

```bash
# terminal 1: API
cd backend && npm run dev

# terminal 2: Vite
cd frontend && npm start

# terminal 3: Electron
cd desktop && npm run dev
```

Env (optional):

- `VITE_DEV_SERVER` — default `http://localhost:3000`
- `ELECTRON_DEV=1` — set by `npm run dev`

## Prod-like local (static UI + /api proxy)

Builds TypeScript and opens Electron against `frontend/build` (Vite `outDir`), serving on `127.0.0.1:3911` and proxying `/api` → backend (keeps refresh cookies same-origin).

```bash
cd frontend && npm run build
cd ../backend && npm run dev   # or Docker
cd ../desktop && npm start
```

Env:

- `BACKEND_URL` — default `http://127.0.0.1:5000`
- `ELECTRON_UI_PORT` — default `3911`. If that port is busy, the shell binds another loopback port.
- `ELECTRON_BACKEND_ALLOWLIST` — comma-separated extra hostnames if backend is not loopback

## Windows installer

```bash
cd frontend && npm run build
cd ../desktop && npm run dist
```

Artifacts: `desktop/release/`.

CI: `test-desktop` runs Linux pack smoke; `build-desktop-win` uploads Windows installer artifacts (no publish).

## Publishing updates

1. Set `electron-builder` `publish.provider=github` with your GitHub `owner` and `repo`.
2. Tag the release as `vX.Y.Z` and run `npm run dist`.
3. Upload the generated installer artifacts and `latest.yml` to the matching GitHub Release.
4. Packaged apps query that GitHub Releases feed via `electron-updater`. Without `app-update.yml` the check is skipped.

## E2E smoke (optional)

Playwright smoke against Docker stack (`register → dashboard → send message`):

```bash
docker compose up -d --build
cd e2e && npm ci && npx playwright install chromium && npm test
```

GitHub Actions: `.github/workflows/e2e-smoke.yml` (manual + nightly).

## Security

- `contextIsolation`, no `nodeIntegration`, `sandbox`
- Preload IPC: `window.electron.getBackendUrl()`, `window.electron.openExternal(url)` (http/https/mailto only)
- Proxy target restricted to loopback (or allowlist)
