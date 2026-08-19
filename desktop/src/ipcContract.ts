import { isSafeExternalUrl } from './security';

export const IPC_HANDLE_CHANNELS = [
  'electron:getBackendUrl',
  'electron:openExternal',
  'electron:isDesktopApp',
  'electron:getPendingDeepLink',
  'electron:checkForUpdates',
  'electron:getUpdateStatus',
  'electron:quitAndInstall',
] as const;

export type IpcHandleChannel = (typeof IPC_HANDLE_CHANNELS)[number];

export function parseOpenExternalUrl(url: unknown): string {
  if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
    throw new Error('Invalid external URL');
  }
  return url;
}
