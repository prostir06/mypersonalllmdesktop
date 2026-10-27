import assert from 'assert';
import { describe, it } from 'node:test';
import { fireAndForget } from './asyncFire';

describe('fireAndForget', () => {
  it('invokes onError when the promise rejects', async () => {
    const seen: unknown[] = [];
    fireAndForget(Promise.reject(new Error('boom')), (err) => {
      seen.push(err);
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(seen.length, 1);
    assert.ok(seen[0] instanceof Error);
    assert.equal((seen[0] as Error).message, 'boom');
  });

  it('does not call onError when the promise resolves', async () => {
    let called = false;
    fireAndForget(Promise.resolve('ok'), () => {
      called = true;
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(called, false);
  });
});
