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
  const devPath = path.join(__dirname, '..', 'assets', 'tray.png');
  if (app.isPackaged) {
    const packagedImage = nativeImage.createFromPath(
      path.join(process.resourcesPath, 'assets', 'tray.png')
    );
    if (!packagedImage.isEmpty()) return packagedImage;
  }

  const image = nativeImage.createFromPath(devPath);
  return image.isEmpty() ? nativeImage.createEmpty() : image;
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
