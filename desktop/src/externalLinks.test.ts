import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openExternalIfSafe } from './externalLinks';

describe('openExternalIfSafe', () => {
  it('opens https and mailto', async () => {
    const opened: string[] = [];
    assert.equal(
      await openExternalIfSafe('https://example.com', async (u) => {
        opened.push(u);
      }),
      true
    );
    assert.equal(
      await openExternalIfSafe('mailto:a@b.c', async (u) => {
        opened.push(u);
      }),
      true
    );
    assert.deepEqual(opened, ['https://example.com', 'mailto:a@b.c']);
  });

  it('refuses file, ms-msdt, and smb', async () => {
    const opened: string[] = [];
    const open = async (u: string) => {
      opened.push(u);
    };
    assert.equal(await openExternalIfSafe('file:///C:/Windows/win.ini', open), false);
    assert.equal(await openExternalIfSafe('ms-msdt:id', open), false);
    assert.equal(await openExternalIfSafe('smb://host/share', open), false);
    assert.deepEqual(opened, []);
  });
});
