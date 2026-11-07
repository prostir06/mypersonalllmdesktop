/** Minimal SearXNG JSON endpoint. The E2E profile points SEARXNG_URL here. */
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { STUB_TOKEN } = createRequire(import.meta.url)('./token.cjs');
export { STUB_TOKEN };

export function createSearxngStub() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname !== '/search') {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        results: [
          {
            title: 'E2E SearXNG stub',
            url: 'https://example.test/stub',
            content: STUB_TOKEN,
          },
        ],
      })
    );
  });
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  createSearxngStub().listen(8088, '0.0.0.0');
}
