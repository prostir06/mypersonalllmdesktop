# Electron Desktop Shell — Design

**Date:** 2026-08-05  
**Status:** Approved for implementation (pending file review)  
**Parent:** Project Evolution v2 — P8 item 3  
**Scope:** Electron shell that loads the existing Vite frontend; API remains an external backend process

## 1. Problem

The product name implies a desktop app (`mypersonalllmdesktop`), but there is no native shell. Users run browser + Docker/nginx. A thin Electron wrapper should ship the built UI while keeping the Express/Prisma API (and Postgres/Ollama) as separate processes — without breaking httpOnly refresh cookies (P8.2).

## 2. Goals

1. **Electron** (not Tauri) shell for Windows-first packaging.
2. **Bundled frontend** (Vite `dist`) in production; **dev** loads Vite URL (`http://localhost:3000`).
3. **Same-origin in prod:** main process serves static UI on `127.0.0.1:<port>` and **proxies** `/api` → configurable backend (`http://127.0.0.1:5000` by default) so `SameSite=Lax` refresh cookies keep working.
4. Secure defaults: `contextIsolation`, no `nodeIntegration`, `sandbox`.
5. Document how to run: backend up separately, then `desktop:dev` / packaged app.

## 3. Non-goals

- Spawning/embedding Node backend or Postgres inside Electron
- Auto-updater, code signing, notarization CI
- macOS/Linux installers in v1 (may build if electron-builder allows cheaply; not acceptance-critical)
- Deep OS integrations (tray, global shortcuts) beyond a normal window
- Changing web auth/cookie contract beyond proxy Path compatibility
- Tauri

## 4. Architecture

```
[Electron main]
  Dev:  loadURL(VITE_DEV_SERVER)           # e.g. http://localhost:3000
  Prod: http.createServer on 127.0.0.1:PORT
          GET /*     → frontend/dist
          /api/*     → proxy → BACKEND_URL (default http://127.0.0.1:5000)
        loadURL(http://127.0.0.1:PORT)

[Renderer] existing React SPA (VITE_API_URL=/api)

[External] Express API + Postgres (+ optional Ollama)
```

### Cookie / auth note

Refresh cookie `Path=/api/auth` and `SameSite=Lax` work when the page origin is `http://127.0.0.1:<port>` and `/api` is same host. Do **not** use `file://` + cross-origin `localhost:5000` in production.

## 5. Repo layout

```
desktop/
  package.json              # electron, electron-builder, typescript
  tsconfig.json
  src/main.ts               # window, static server, proxy, lifecycle
  src/preload.ts            # minimal; contextBridge only if needed later
  electron-builder.yml      # win nsis/portable targets
```

Root scripts (or documented desktop scripts):

- `npm run desktop:dev` — wait for Vite (or assume running) + launch Electron
- `npm run desktop:build` — `frontend` build → copy/link dist → electron-builder

Prefer **not** polluting `frontend/package.json` with Electron runtime deps; keep them under `desktop/`.

## 6. Main process behavior

| Concern | Behavior |
|---------|----------|
| Window | Single `BrowserWindow`, reasonable default size, `show` when ready-to-show |
| Security | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no `remote` |
| Devtools | Open only when `ELECTRON_DEV=1` / `NODE_ENV=development` |
| Backend URL | `process.env.BACKEND_URL` or `LLM_BACKEND_URL` (default `http://127.0.0.1:5000`) |
| Static port | `ELECTRON_UI_PORT` default `3911` (avoid clash with 3000/5000) |
| Quit | Close window → quit app (standard); no tray in v1 |
| External links | Open in system browser (`shell.openExternal`) if needed later |

Proxy: forward method, headers, body, and **cookies**; stream responses (SSE `/api/chat/stream` must not buffer — use streaming proxy or `http-proxy` with suitable options).

## 7. Frontend config

- Production Electron build: bake `VITE_API_URL=/api` (already default).
- No Electron-specific React code required for v1.
- Optional later: detect `window.electron` via preload — **YAGNI**.

## 8. Packaging

- **electron-builder**, Windows: `nsis` and/or `portable`.
- Artifact under `desktop/dist` / `release/`.
- App id / productName: e.g. `LLM Assistant Studio` / `mypersonalllmdesktop`.

## 9. Testing / verification

- Smoke: `desktop:dev` opens window against Vite (manual).
- Unit (optional light): proxy path join / URL allowlist for BACKEND_URL (SSRF: only loopback or configured host — **do not** proxy arbitrary URLs).
- CI: do not require full Electron GUI in CI for v1; optional `tsc` for `desktop/`.

## 10. Acceptance

- [ ] `desktop/` exists with main + preload + builder config
- [ ] Dev: Electron loads Vite app
- [ ] Prod-like: static + `/api` proxy; login/refresh cookie path works against local backend
- [ ] No nodeIntegration in renderer
- [ ] README section: how to run desktop + backend

## 11. Follow-ups

- Auto-start local backend profile
- Code signing
- Tray + start minimized
- Deep link protocol
