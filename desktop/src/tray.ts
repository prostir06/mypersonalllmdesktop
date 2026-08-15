/**
 * System tray: show/hide main window and quit.
 */
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  type NativeImage,
} from 'electron';
import path from 'path';

let tray: Tray | null = null;

function trayIcon(): NativeImage {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'tray.png')
    : path.join(__dirname, '..', 'assets', 'tray.png');
  const fallbackPath = path.join(__dirname, '..', 'assets', 'tray.png');

  const image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) return image;

  const fallbackImage = nativeImage.createFromPath(fallbackPath);
  return fallbackImage.isEmpty() ? nativeImage.createEmpty() : fallbackImage;
}

type TrayOptions = {
  getMainWindow: () => BrowserWindow | null;
  onOpenSettings: () => void;
  onCheckForUpdates: () => void;
};

function showWindow(win: BrowserWindow | null): void {
  if (!win) return;
  win.show();
  win.focus();
}

export function createTray({
  getMainWindow,
  onOpenSettings,
  onCheckForUpdates,
}: TrayOptions): Tray {
  if (tray) return tray;

  tray = new Tray(trayIcon());
  tray.setToolTip('LLM Assistant Studio');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показати',
      click: () => {
        showWindow(getMainWindow());
      },
    },
    {
      label: 'Налаштування',
      click: onOpenSettings,
    },
    {
      label: 'Перевірити оновлення',
      click: onCheckForUpdates,
    },
    {
      label: 'Приховати',
      click: () => getMainWindow()?.hide(),
    },
    { type: 'separator' },
    {
      label: 'Вийти',
      click: () => {
        (app as typeof app & { isQuitting?: boolean }).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    showWindow(getMainWindow());
  });

  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
