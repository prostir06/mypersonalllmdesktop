import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it } from 'node:test';
import { hasUpdateFeed } from './updateFeed';

describe('hasUpdateFeed', () => {
  it('is false until app-update.yml exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-'));
    assert.equal(hasUpdateFeed(undefined), false);
    assert.equal(hasUpdateFeed(dir), false);
    fs.writeFileSync(path.join(dir, 'app-update.yml'), 'provider: generic\n');
    assert.equal(hasUpdateFeed(dir), true);
  });
});
