import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import { createSearxngStub, STUB_TOKEN } from './server.mjs';

describe('searxng stub', () => {
  it('returns one JSON result', async () => {
    const server = createSearxngStub();
    const port = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    try {
      const body = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/search?q=test&format=json`, (res) => {
          const parts = [];
          res.on('data', (part) => parts.push(part));
          res.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
        }).on('error', reject);
      });
      const parsed = JSON.parse(body);
      assert.equal(parsed.results[0].content, STUB_TOKEN);
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
