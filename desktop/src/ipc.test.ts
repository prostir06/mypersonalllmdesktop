import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  IPC_HANDLE_CHANNELS,
  parseOpenExternalUrl,
} from './ipcContract';

describe('IPC handle allowlist', () => {
  it('exposes a fixed set of electron:* invoke channels', () => {
    assert.deepEqual([...IPC_HANDLE_CHANNELS].sort(), [
      'electron:checkForUpdates',
      'electron:getBackendUrl',
      'electron:getPendingDeepLink',
      'electron:getUpdateStatus',
      'electron:isDesktopApp',
      'electron:openExternal',
      'electron:quitAndInstall',
    ]);
  });
});

describe('parseOpenExternalUrl', () => {
  it('accepts http(s) and mailto strings', () => {
    assert.equal(
      parseOpenExternalUrl('https://example.com/docs'),
      'https://example.com/docs'
    );
    assert.equal(parseOpenExternalUrl('mailto:a@b.c'), 'mailto:a@b.c');
  });

  it('rejects non-string and unsafe payloads', () => {
    assert.throws(() => parseOpenExternalUrl(1), /Invalid external URL/);
    assert.throws(() => parseOpenExternalUrl('javascript:alert(1)'), /Invalid external URL/);
    assert.throws(() => parseOpenExternalUrl('file:///etc/passwd'), /Invalid external URL/);
  });
});
