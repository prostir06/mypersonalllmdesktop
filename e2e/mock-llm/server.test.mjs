import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import { createMockLlmServer } from './server.mjs';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Connection: 'close',
        },
      },
      (res) => {
        const parts = [];
        res.on('data', (part) => parts.push(part));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            type: res.headers['content-type'] || '',
            body: Buffer.concat(parts).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end(payload);
  });
}

describe('mock llm', () => {
  it('streams chat text and returns a fixed embedding', async () => {
    const server = createMockLlmServer();
    const port = await listen(server);
    try {
      const chat = await post(port, '/v1/chat/completions', {
        model: 'gpt-4o-mini',
        stream: true,
        messages: [{ role: 'user', content: 'ping' }],
      });
      assert.equal(chat.status, 200);
      assert.match(chat.type, /text\/event-stream/);
      assert.match(chat.body, /Мок-відповідь/);
      assert.match(chat.body, /\[DONE\]/);

      const echoed = await post(port, '/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: 'searxng-stub-token' }],
      });
      assert.equal(echoed.status, 200, echoed.body);
      assert.match(echoed.body, /searxng-stub-token/);

      const embedded = await post(port, '/v1/embeddings', {
        model: 'text-embedding-3-small',
        input: 'hello',
        dimensions: 768,
      });
      const parsed = JSON.parse(embedded.body);
      assert.equal(parsed.data[0].embedding.length, 768);
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
