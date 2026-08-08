/**
 * Resolve where Electron should load the static Vite UI from.
 * Vite outDir is `frontend/build` (also used by Docker/nginx) — not `dist`.
 */
import fs from 'fs';
import path from 'path';

/** Packaged app: electron-builder copies UI into resources/ui. */
export function packagedUiRoot(resourcesPath: string): string {
  return path.join(resourcesPath, 'ui');
}

/**
 * Unpackaged / `npm start`: UI lives next to the desktop package.
 * `desktopDistDir` is typically `desktop/dist` (__dirname of compiled main).
 */
export function unpackagedUiRoot(desktopDistDir: string): string {
  return path.join(desktopDistDir, '..', '..', 'frontend', 'build');
}

/**
 * Ensure the UI directory exists before starting the static server.
 * Throws a clear Error so createWindow can log and quit.
 */
export function assertUiRootExists(uiRoot: string): string {
  try {
    if (!fs.existsSync(uiRoot) || !fs.statSync(uiRoot).isDirectory()) {
      throw new Error(
        `UI root missing or not a directory: ${uiRoot}. Run: cd frontend && npm run build`
      );
    }
    return uiRoot;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('UI root missing')) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to validate UI root ${uiRoot}: ${message}`);
  }
}
