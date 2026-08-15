/**
 * Electron main: secure window; prod serves UI + /api proxy; dev loads Vite.
 */
import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { resolveBackendOrigin, uiPort } from './backendUrl';
import { isAllowedAppOrigin } from './security';
import {
  emitCheckForUpdatesRequested,
  emitNavigate,
  registerIpcHandlers,
  setBackendOrigin,
  setPendingDeepLink,
} from './ipc';
import { startUiServer, type UiServer } from './uiServer';
import {
  assertUiRootExists,
  packagedUiRoot,
  unpackagedUiRoot,
} from './uiPaths';
import { createTray, destroyTray } from './tray';
import { initUpdater, checkForUpdates } from './updater';
import {
  DEEP_LINK_PROTOCOL,
  findDeepLinkArg,
  parseDeepLink,
  type DeepLinkPayload,
} from './deepLinks';

const isDev = process.env.ELECTRON_DEV === '1';

let mainWindow: BrowserWindow | null = null;
let uiServer: UiServer | null = null;

type AppWithQuitFlag = typeof app & { isQuitting?: boolean };

function deliverDeepLink(payload: DeepLinkPayload): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) {
    setPendingDeepLink(payload);
    return;
  }

  if (win.webContents.isLoading()) {
    setPendingDeepLink(payload);
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('electron:deepLink', payload);
    });
    return;
  }

  win.webContents.send('electron:deepLink', payload);
  win.show();
  win.focus();
}

function handleDeepLinkUrl(raw: string): void {
  const payload = parseDeepLink(raw);
  if (!payload) return;
  deliverDeepLink(payload);
}

function preloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function showMainWindow(): BrowserWindow | null {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return null;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return win;
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

  mainWindow.on('close', (event) => {
    const quitting = (app as AppWithQuitFlag).isQuitting;
    if (!quitting && process.platform !== 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
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
    setBackendOrigin(resolveBackendOrigin());
    allowedOrigins.add(new URL(viteUrl).origin);
    await mainWindow.loadURL(viteUrl);
    return;
  }

  try {
    const backendOrigin = resolveBackendOrigin();
    setBackendOrigin(backendOrigin);
    const port = uiPort();
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

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = findDeepLinkArg(argv);
    if (url) handleDeepLinkUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLinkUrl(url);
  });

  app.whenReady().then(() => {
    registerIpcHandlers();
    initUpdater(() => mainWindow);
    createTray({
      getMainWindow: () => mainWindow,
      onOpenSettings: () => {
        const win = showMainWindow();
        emitNavigate(win, { path: '/settings' });
      },
      onCheckForUpdates: () => {
        const win = showMainWindow();
        emitCheckForUpdatesRequested(win);
        void checkForUpdates();
      },
    });

    void createWindow()
      .then(() => {
        const launchLink = findDeepLinkArg(process.argv);
        if (launchLink) handleDeepLinkUrl(launchLink);

        if (app.isPackaged) {
          void checkForUpdates();
        }
      })
      .catch((err) => {
        console.error('Failed to start Electron UI:', err);
        app.quit();
      });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      } else {
        showMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    (app as AppWithQuitFlag).isQuitting = true;
    destroyTray();
    void uiServer?.close();
    uiServer = null;
  });
}
