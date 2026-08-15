/**
 * Electron preload — minimal validated bridge for renderer.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DeepLinkPayload } from './deepLinks';
import type { ElectronNavigatePayload } from './electronBridge';
import type { UpdateStatus } from './updater';

contextBridge.exposeInMainWorld('electron', {
  getBackendUrl: (): Promise<string> =>
    ipcRenderer.invoke('electron:getBackendUrl'),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('electron:openExternal', url),
  isDesktopApp: (): Promise<boolean> =>
    ipcRenderer.invoke('electron:isDesktopApp'),
  getPendingDeepLink: (): Promise<DeepLinkPayload | null> =>
    ipcRenderer.invoke('electron:getPendingDeepLink'),
  checkForUpdates: (): Promise<UpdateStatus> =>
    ipcRenderer.invoke('electron:checkForUpdates'),
  getUpdateStatus: (): Promise<UpdateStatus> =>
    ipcRenderer.invoke('electron:getUpdateStatus'),
  quitAndInstall: (): Promise<void> =>
    ipcRenderer.invoke('electron:quitAndInstall'),
  onDeepLink: (handler: (payload: DeepLinkPayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: DeepLinkPayload) => {
      handler(payload);
    };
    ipcRenderer.on('electron:deepLink', listener);
    return () => ipcRenderer.removeListener('electron:deepLink', listener);
  },
  onNavigate: (
    handler: (payload: ElectronNavigatePayload) => void
  ): (() => void) => {
    const listener = (_event: unknown, payload: ElectronNavigatePayload) => {
      handler(payload);
    };
    ipcRenderer.on('electron:navigate', listener);
    return () => ipcRenderer.removeListener('electron:navigate', listener);
  },
  onCheckForUpdates: (handler: () => void): (() => void) => {
    const listener = () => {
      handler();
    };
    ipcRenderer.on('electron:checkForUpdates', listener);
    return () =>
      ipcRenderer.removeListener('electron:checkForUpdates', listener);
  },
  onUpdateStatus: (handler: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: unknown, status: UpdateStatus) => {
      handler(status);
    };
    ipcRenderer.on('electron:updateStatus', listener);
    return () => ipcRenderer.removeListener('electron:updateStatus', listener);
  },
});
