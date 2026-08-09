/**
 * Electron main: secure window; prod serves UI + /api proxy; dev loads Vite.
 */
import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { resolveBackendOrigin, uiPort } from './backendUrl';
import { isAllowedAppOrigin } from './security';
import { startUiServer, type UiServer } from './uiServer';
import {
  assertUiRootExists,
  packagedUiRoot,
  unpackagedUiRoot,
} from './uiPaths';

const isDev = process.env.ELECTRON_DEV === '1';

let mainWindow: BrowserWindow | null = null;
let uiServer: UiServer | null = null;

function preloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

async function createWindow(): Promise<void> {
  const allowedOrigins = new Set<string>();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'LLM Assistant Studio',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppOrigin(url, allowedOrigins)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  if (isDev) {
    const viteUrl = process.env.VITE_DEV_SERVER || 'http://localhost:3000';
    allowedOrigins.add(new URL(viteUrl).origin);
    await mainWindow.loadURL(viteUrl);
    return;
  }

  try {
    const backendOrigin = resolveBackendOrigin();
    const port = uiPort();
    // Packaged: resources/ui. Local start: Vite outDir frontend/build.
    const rawRoot = app.isPackaged
      ? packagedUiRoot(process.resourcesPath)
      : unpackagedUiRoot(__dirname);
    const uiRoot = assertUiRootExists(rawRoot);

    uiServer = await startUiServer({ uiRoot, backendOrigin, port });
    const uiOrigin = `http://127.0.0.1:${uiServer.port}`;
    allowedOrigins.add(uiOrigin);
    await mainWindow.loadURL(uiOrigin);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to bind static UI + /api proxy:', message);
    throw err;
  }
}

app.whenReady().then(() => {
  void createWindow().catch((err) => {
    console.error('Failed to start Electron UI:', err);
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  void uiServer?.close();
  uiServer = null;
});
