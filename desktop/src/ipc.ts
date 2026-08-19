/**
 * IPC handlers exposed to preload (validated in main process).
 */
import { BrowserWindow, ipcMain, shell } from 'electron';
import { resolveBackendOrigin } from './backendUrl';
import type { ElectronNavigatePayload } from './electronBridge';
import {
  IPC_HANDLE_CHANNELS,
  parseOpenExternalUrl,
} from './ipcContract';
import {
  checkForUpdates,
  getUpdateStatus,
  quitAndInstall,
} from './updater';
import type { DeepLinkPayload } from './deepLinks';

let backendOrigin = resolveBackendOrigin();
let pendingDeepLink: DeepLinkPayload | null = null;

export function setBackendOrigin(origin: string): void {
  backendOrigin = origin;
}

export function getBackendOrigin(): string {
  return backendOrigin;
}

export function setPendingDeepLink(link: DeepLinkPayload | null): void {
  pendingDeepLink = link;
}

export function consumePendingDeepLink(): DeepLinkPayload | null {
  const link = pendingDeepLink;
  pendingDeepLink = null;
  return link;
}

export function emitNavigate(
  win: BrowserWindow | null,
  payload: ElectronNavigatePayload
): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('electron:navigate', payload);
}

export function emitCheckForUpdatesRequested(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('electron:checkForUpdates');
}

export function registerIpcHandlers(): void {
  ipcMain.handle('electron:getBackendUrl', () => backendOrigin);

  ipcMain.handle('electron:openExternal', async (_event, url: unknown) => {
    const safe = parseOpenExternalUrl(url);
    await shell.openExternal(safe);
  });

  ipcMain.handle('electron:isDesktopApp', () => true);

  ipcMain.handle('electron:getPendingDeepLink', () =>
    consumePendingDeepLink()
  );

  ipcMain.handle('electron:checkForUpdates', async () => {
    const status = await checkForUpdates();
    return status;
  });

  ipcMain.handle('electron:getUpdateStatus', () => getUpdateStatus());

  ipcMain.handle('electron:quitAndInstall', () => {
    quitAndInstall();
  });
}

export function unregisterIpcHandlers(): void {
  for (const channel of IPC_HANDLE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
}
