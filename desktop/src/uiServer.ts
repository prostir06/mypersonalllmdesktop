/**
 * Local static UI + /api reverse proxy (SSE-friendly streaming).
 */
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import type { AddressInfo } from 'net';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function contentType(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function safeJoin(root: string, reqPath: string): string | null {
  const decoded = decodeURIComponent(reqPath.split('?')[0]);
  const rel = decoded.replace(/^\/+/, '') || 'index.html';
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(path.normalize(root + path.sep)) && full !== path.normalize(root)) {
    return null;
  }
  return full;
}

export type UiServer = {
  port: number;
  close: () => Promise<void>;
};

export function startUiServer(opts: {
  uiRoot: string;
  backendOrigin: string;
  port: number;
}): Promise<UiServer> {
  const { uiRoot, backendOrigin, port } = opts;

  const server = http.createServer((req, res) => {
    const method = req.method || 'GET';
    const url = req.url || '/';

    if (url === '/api' || url.startsWith('/api/')) {
      proxyApi(req, res, backendOrigin, url);
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }

    let filePath = safeJoin(uiRoot, url === '/' ? '/index.html' : url);
    if (!filePath) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // SPA fallback
      filePath = path.join(uiRoot, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404).end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        port: addr.port,
        close: () =>
          new Promise((resClose, rejClose) => {
            server.close((err) => (err ? rejClose(err) : resClose()));
          }),
      });
    });
  });
}

function proxyApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  backendOrigin: string,
  url: string
): void {
  const target = new URL(url, backendOrigin);
  const lib = target.protocol === 'https:' ? https : http;

  const headers = { ...req.headers, host: target.host };
  // Avoid compressing SSE oddly through double layers; let backend decide
  delete headers['accept-encoding'];

  const proxyReq = lib.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: `Backend unreachable: ${err.message}` }));
  });

  req.pipe(proxyReq);
}
