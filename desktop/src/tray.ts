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

let tray: Tray | null = null;

function trayIcon(): NativeImage {
  // Minimal 16x16 indigo tile — replace with packaged .ico when available.
  const dataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFUlEQVR42mNk+M9Qz0AEYBxVSFUAABXBAQf+6nAAAAAASUVORK5CYII=';
  const image = nativeImage.createFromDataURL(dataUrl);
  return image.isEmpty() ? nativeImage.createEmpty() : image;
}

export function createTray(getMainWindow: () => BrowserWindow | null): Tray {
  if (tray) return tray;

  tray = new Tray(trayIcon());
  tray.setToolTip('LLM Assistant Studio');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показати',
      click: () => {
        const win = getMainWindow();
        if (!win) return;
        win.show();
        win.focus();
      },
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
    const win = getMainWindow();
    if (!win) return;
    win.show();
    win.focus();
  });

  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
