/**
 * Auto-update via electron-updater (packaged builds only).
 */
import { app, Notification } from 'electron';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import type { BrowserWindow } from 'electron';
import { hasUpdateFeed } from './updateFeed';

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

let initialized = false;
let lastStatus: UpdateStatus = { state: 'idle' };
let getMainWindow: (() => BrowserWindow | null) | null = null;

function emit(status: UpdateStatus): void {
  lastStatus = status;
  const win = getMainWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('electron:updateStatus', status);
  }
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  n.show();
}

export function getUpdateStatus(): UpdateStatus {
  return lastStatus;
}

export function initUpdater(
  windowGetter: () => BrowserWindow | null
): void {
  if (initialized) return;
  initialized = true;
  getMainWindow = windowGetter;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  if (!app.isPackaged) {
    return;
  }

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }));

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    emit({ state: 'available', version: info.version });
    notify(
      'Доступне оновлення',
      `Завантажується версія ${info.version}…`
    );
  });

  autoUpdater.on('update-not-available', () => {
    emit({ state: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress) => {
    emit({
      state: 'downloading',
      percent: Math.round(progress.percent || 0),
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    emit({ state: 'downloaded', version: info.version });
    notify(
      'Оновлення готове',
      `Версія ${info.version} завантажена. Перезапустіть застосунок.`
    );
  });

  autoUpdater.on('error', (err: Error) => {
    emit({ state: 'error', message: err.message || 'Update failed' });
  });
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged || !hasUpdateFeed(process.resourcesPath)) {
    const status: UpdateStatus = {
      state: 'not-available',
    };
    emit(status);
    return status;
  }

  emit({ state: 'checking' });
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo) {
      emit({ state: 'not-available' });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ state: 'error', message });
  }
  return lastStatus;
}

export function quitAndInstall(): void {
  if (!app.isPackaged) return;
  (app as typeof app & { isQuitting?: boolean }).isQuitting = true;
  autoUpdater.quitAndInstall();
}
