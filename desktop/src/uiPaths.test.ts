import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, afterEach } from 'node:test';
import {
  assertUiRootExists,
  packagedUiRoot,
  unpackagedUiRoot,
} from './uiPaths';

describe('uiPaths', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('packagedUiRoot points at resources/ui', () => {
    assert.strictEqual(
      packagedUiRoot('/app/resources'),
      path.join('/app/resources', 'ui')
    );
  });

  it('unpackagedUiRoot points at frontend/build from desktop/dist', () => {
    const desktopDist = path.join('repo', 'desktop', 'dist');
    assert.strictEqual(
      unpackagedUiRoot(desktopDist),
      path.join('repo', 'frontend', 'build')
    );
  });

  it('assertUiRootExists returns path when directory exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-root-'));
    tmpDirs.push(dir);
    assert.strictEqual(assertUiRootExists(dir), dir);
  });

  it('assertUiRootExists throws when path is missing', () => {
    const missing = path.join(os.tmpdir(), `ui-missing-${Date.now()}`);
    assert.throws(
      () => assertUiRootExists(missing),
      /UI root missing|Failed to validate UI root/
    );
  });
});
