/**
 * IPC handlers exposed to preload (validated in main process).
 */
import { ipcMain, shell } from 'electron';
import { resolveBackendOrigin } from './backendUrl';
import { isSafeExternalUrl } from './security';

let backendOrigin = resolveBackendOrigin();

export function setBackendOrigin(origin: string): void {
  backendOrigin = origin;
}

export function getBackendOrigin(): string {
  return backendOrigin;
}

export function registerIpcHandlers(): void {
  ipcMain.handle('electron:getBackendUrl', () => backendOrigin);

  ipcMain.handle('electron:openExternal', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
      throw new Error('Invalid external URL');
    }
    await shell.openExternal(url);
  });
}

export function unregisterIpcHandlers(): void {
  ipcMain.removeHandler('electron:getBackendUrl');
  ipcMain.removeHandler('electron:openExternal');
}
