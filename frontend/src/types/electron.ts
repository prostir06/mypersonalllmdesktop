/** Renderer-side Electron bridge types (mirror desktop preload). */

export type DeepLinkPayload = {
  type: 'chat';
  conversationId: string;
};

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

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

export function isElectronApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electron);
}

export function navigateToDeepLink(
  payload: DeepLinkPayload,
  navigate: (path: string) => void
): void {
  if (payload.type === 'chat') {
    navigate(`/dashboard?conversation=${payload.conversationId}`);
  }
}
