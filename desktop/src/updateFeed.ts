/**
 * electron-builder writes app-update.yml only when a publish feed is configured.
 * v19 does not ship a feed; skip update checks until that file exists.
 */
import fs from 'fs';
import path from 'path';

export function hasUpdateFeed(resourcesPath: string | undefined): boolean {
  if (!resourcesPath) return false;
  try {
    return fs.existsSync(path.join(resourcesPath, 'app-update.yml'));
  } catch {
    return false;
  }
}
