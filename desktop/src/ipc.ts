/**
 * IPC handlers exposed to preload (validated in main process).
 */
import { BrowserWindow, ipcMain, shell } from 'electron';
import { resolveBackendOrigin } from './backendUrl';
import type { ElectronNavigatePayload } from './electronBridge';
import { isSafeExternalUrl } from './security';
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
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
      throw new Error('Invalid external URL');
    }
    await shell.openExternal(url);
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
  ipcMain.removeHandler('electron:getBackendUrl');
  ipcMain.removeHandler('electron:openExternal');
  ipcMain.removeHandler('electron:isDesktopApp');
  ipcMain.removeHandler('electron:getPendingDeepLink');
  ipcMain.removeHandler('electron:checkForUpdates');
  ipcMain.removeHandler('electron:getUpdateStatus');
  ipcMain.removeHandler('electron:quitAndInstall');
}
