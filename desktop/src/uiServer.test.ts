import assert from 'node:assert/strict';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { afterEach, describe, it } from 'node:test';
import { resolveProxyTarget, startUiServer, type UiServer } from './uiServer';

const BACKEND = 'http://127.0.0.1:5000';

function makeUiRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-server-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>ok</html>');
  return dir;
}

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
  });
}

describe('resolveProxyTarget', () => {
  it('rejects a malformed URL and a retargeted origin', () => {
    assert.throws(() => resolveProxyTarget('http://%', BACKEND), /Malformed URL/);
    assert.throws(
      () => resolveProxyTarget('http://evil.example/api/x', BACKEND),
      /Malformed URL/
    );
    assert.equal(
      resolveProxyTarget('/api/health', BACKEND).href,
      'http://127.0.0.1:5000/api/health'
    );
  });
});

describe('startUiServer', () => {
  const open: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (open.length) {
      const close = open.pop();
      if (close) await close();
    }
  });

  it('falls back when the preferred port is busy', async () => {
    const uiRoot = makeUiRoot();
    const first = await startUiServer({ uiRoot, backendOrigin: BACKEND, port: 0 });
    open.push(() => first.close());
    const second = await startUiServer({
      uiRoot,
      backendOrigin: BACKEND,
      port: first.port,
    });
    open.push(() => second.close());
    assert.notEqual(second.port, first.port);
    const page = await get(`http://127.0.0.1:${second.port}/`);
    assert.equal(page.status, 200);
    assert.match(page.body, /ok/);
  });

  it('returns 400 for a malformed path', async () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      const ui = await startServer();
      const res = await get(`http://127.0.0.1:${ui.port}/%`);
      assert.equal(res.status, 400);
      assert.equal(errors.length, 0);
    } finally {
      console.error = original;
    }
  });

  it('logs an unexpected request error and returns 500', async () => {
    const errors: unknown[][] = [];
    const originalError = console.error;
    const fsMut = fs as unknown as { statSync: typeof fs.statSync };
    const originalStat = fsMut.statSync;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    fsMut.statSync = () => {
      throw new Error('stat blew up');
    };
    try {
      const ui = await startServer();
      const res = await get(`http://127.0.0.1:${ui.port}/`);
      assert.equal(res.status, 500);
      assert.equal(res.body, 'Internal error');
      assert.equal(errors.length, 1);
      assert.match(String(errors[0][1]), /stat blew up/);
    } finally {
      fsMut.statSync = originalStat;
      console.error = originalError;
    }
  });

  it('forwards X-Forwarded-* and aborts when the client drops', async () => {
    const seen: Record<string, string | string[] | undefined> = {};
    let upstreamClosed = false;
    const backend = http.createServer((req, res) => {
      if (req.url === '/api/echo') {
        Object.assign(seen, req.headers);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('echo');
        return;
      }
      req.on('close', () => {
        upstreamClosed = true;
      });
    });
    await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
    open.push(
      () =>
        new Promise((resolve, reject) => {
          backend.close((err) => (err ? reject(err) : resolve()));
        })
    );
    const address = backend.address();
    if (!address || typeof address === 'string') throw new Error('no backend port');
    const ui = await startUiServer({
      uiRoot: makeUiRoot(),
      backendOrigin: `http://127.0.0.1:${address.port}`,
      port: 0,
      proxyHeadersTimeoutMs: 200,
    });
    open.push(() => ui.close());

    const echoed = await get(`http://127.0.0.1:${ui.port}/api/echo`);
    assert.equal(echoed.status, 200);
    assert.equal(seen['x-forwarded-proto'], 'http');
    assert.equal(typeof seen['x-forwarded-for'], 'string');
    assert.equal(typeof seen['x-forwarded-host'], 'string');

    let hangSeen = false;
    const previous = backend.listeners('request').slice();
    backend.removeAllListeners('request');
    backend.on('request', (req, res) => {
      if (req.url === '/api/hang') {
        hangSeen = true;
        req.on('close', () => {
          upstreamClosed = true;
        });
        return;
      }
      for (const listener of previous) {
        (listener as (req: http.IncomingMessage, res: http.ServerResponse) => void)(req, res);
      }
    });
    const hang = http.get(`http://127.0.0.1:${ui.port}/api/hang`, () => {
      throw new Error('hang should not answer');
    });
    hang.on('error', () => undefined);
    await waitFor(() => hangSeen);
    hang.destroy();
    await waitFor(() => upstreamClosed);
  });

  it('returns 502 when the backend does not answer in time', async () => {
    const backend = http.createServer(() => {
      /* hang until the proxy times out */
    });
    await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
    open.push(
      () =>
        new Promise((resolve, reject) => {
          backend.close((err) => (err ? reject(err) : resolve()));
        })
    );
    const address = backend.address();
    if (!address || typeof address === 'string') throw new Error('no backend port');
    const ui = await startUiServer({
      uiRoot: makeUiRoot(),
      backendOrigin: `http://127.0.0.1:${address.port}`,
      port: 0,
      proxyHeadersTimeoutMs: 50,
    });
    open.push(() => ui.close());
    const res = await get(`http://127.0.0.1:${ui.port}/api/hang`);
    assert.equal(res.status, 502);
    assert.match(res.body, /Backend timeout/);
  });

  async function startServer(): Promise<UiServer> {
    const ui = await startUiServer({
      uiRoot: makeUiRoot(),
      backendOrigin: BACKEND,
      port: 0,
    });
    open.push(() => ui.close());
    return ui;
  }
});

async function waitFor(ready: () => boolean): Promise<void> {
  const start = Date.now();
  while (!ready()) {
    if (Date.now() - start > 1000) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
