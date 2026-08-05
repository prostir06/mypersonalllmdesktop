/**
 * Electron main: secure window; prod serves UI + /api proxy; dev loads Vite.
 */
import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { resolveBackendOrigin, uiPort } from './backendUrl';
import { startUiServer, type UiServer } from './uiServer';

const isDev = process.env.ELECTRON_DEV === '1';

let mainWindow: BrowserWindow | null = null;
let uiServer: UiServer | null = null;

function preloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function packagedUiRoot(): string {
  // electron-builder extraResources → resources/ui
  return path.join(process.resourcesPath, 'ui');
}

function devUiRoot(): string {
  // When running unpackaged: ../frontend/dist relative to desktop/
  return path.join(__dirname, '..', '..', 'frontend', 'dist');
}

async function createWindow(): Promise<void> {
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

  if (isDev) {
    const viteUrl = process.env.VITE_DEV_SERVER || 'http://localhost:3000';
    await mainWindow.loadURL(viteUrl);
    return;
  }

  const backendOrigin = resolveBackendOrigin();
  const port = uiPort();
  const uiRoot = app.isPackaged ? packagedUiRoot() : devUiRoot();

  uiServer = await startUiServer({ uiRoot, backendOrigin, port });
  await mainWindow.loadURL(`http://127.0.0.1:${uiServer.port}`);
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
