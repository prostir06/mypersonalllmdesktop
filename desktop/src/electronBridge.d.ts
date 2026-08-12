/**
 * Renderer typings for the Electron preload bridge.
 */
import type { DeepLinkPayload } from './deepLinks';
import type { UpdateStatus } from './updater';

export type ElectronBridge = {
  getBackendUrl: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  isDesktopApp: () => Promise<boolean>;
  getPendingDeepLink: () => Promise<DeepLinkPayload | null>;
  checkForUpdates: () => Promise<UpdateStatus>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  quitAndInstall: () => Promise<void>;
  onDeepLink: (handler: (payload: DeepLinkPayload) => void) => () => void;
  onUpdateStatus: (handler: (status: UpdateStatus) => void) => () => void;
};

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}

export type { DeepLinkPayload, UpdateStatus };

export {};
