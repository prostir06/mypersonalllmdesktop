/**
 * Electron preload — minimal validated bridge for renderer.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getBackendUrl: (): Promise<string> =>
    ipcRenderer.invoke('electron:getBackendUrl'),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('electron:openExternal', url),
});
