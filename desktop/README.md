# Desktop (Electron)

Windows-first Electron shell for the Vite frontend. The Express API and Postgres stay external.

## Prerequisites

- Node 20+
- Backend running (e.g. `cd backend && npm run dev` or Docker Compose)
- For **dev**: frontend Vite on port 3000 (`cd frontend && npm run dev`)
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
cd frontend && npm run dev

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
- `ELECTRON_UI_PORT` — default `3911`
- `ELECTRON_BACKEND_ALLOWLIST` — comma-separated extra hostnames if backend is not loopback

## Windows installer

```bash
cd frontend && npm run build
cd ../desktop && npm run dist
```

Artifacts: `desktop/release/`.

## Security

- `contextIsolation`, no `nodeIntegration`, `sandbox`
- Proxy target restricted to loopback (or allowlist)
