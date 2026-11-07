/**
 * Local static UI + /api reverse proxy (SSE-friendly streaming).
 */
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import type { AddressInfo } from 'net';
import { ARTIFACT_SANDBOX_CSP, UI_CSP } from './security';

const DEFAULT_PROXY_HEADERS_TIMEOUT_MS = 30_000;

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

export class MalformedUrlError extends Error {
  constructor() {
    super('Malformed URL');
    this.name = 'MalformedUrlError';
  }
}

/** Proxy only paths that stay on the configured backend origin. */
export function resolveProxyTarget(url: string, backendOrigin: string): URL {
  let target: URL;
  try {
    target = new URL(url, backendOrigin);
  } catch {
    throw new MalformedUrlError();
  }
  if (target.origin !== new URL(backendOrigin).origin) {
    throw new MalformedUrlError();
  }
  return target;
}

function safeJoin(root: string, reqPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(reqPath.split('?')[0]);
  } catch (err) {
    if (err instanceof URIError) throw new MalformedUrlError();
    throw err;
  }
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

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      const addr = server.address() as AddressInfo;
      resolve(addr.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

export function startUiServer(opts: {
  uiRoot: string;
  backendOrigin: string;
  port: number;
  proxyHeadersTimeoutMs?: number;
}): Promise<UiServer> {
  const { uiRoot, backendOrigin, port } = opts;
  const proxyHeadersTimeoutMs =
    opts.proxyHeadersTimeoutMs ?? DEFAULT_PROXY_HEADERS_TIMEOUT_MS;

  const server = http.createServer((req, res) => {
    try {
      handleRequest(req, res);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const bad = err instanceof MalformedUrlError;
      res.writeHead(bad ? 400 : 500).end(bad ? 'Bad request' : 'Internal error');
    }
  });

  function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const method = req.method || 'GET';
    const url = req.url || '/';

    if (url === '/api' || url.startsWith('/api/')) {
      proxyApi(req, res, backendOrigin, url, proxyHeadersTimeoutMs);
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

    const csp =
      path.basename(filePath) === 'artifact-sandbox.html'
        ? ARTIFACT_SANDBOX_CSP
        : UI_CSP;

    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  }

  return listen(server, port)
    .catch((err: NodeJS.ErrnoException) => {
      if (err?.code !== 'EADDRINUSE') throw err;
      return listen(server, 0);
    })
    .then((boundPort) => ({
      port: boundPort,
      close: () =>
        new Promise<void>((resClose, rejClose) => {
          server.close((err) => (err ? rejClose(err) : resClose()));
        }),
    }));
}

function proxyApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  backendOrigin: string,
  url: string,
  headersTimeoutMs: number
): void {
  const target = resolveProxyTarget(url, backendOrigin);
  const lib = target.protocol === 'https:' ? https : http;

  const headers: http.OutgoingHttpHeaders = { ...req.headers, host: target.host };
  // Avoid compressing SSE oddly through double layers; let backend decide
  delete headers['accept-encoding'];
  headers['x-forwarded-for'] = req.socket.remoteAddress || '127.0.0.1';
  headers['x-forwarded-proto'] = 'http';
  headers['x-forwarded-host'] = headerValue(req.headers.host) || target.host;

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
      proxyReq.setTimeout(0);
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.setTimeout(headersTimeoutMs, () => {
    proxyReq.destroy(new Error('Backend timeout'));
  });

  res.on('close', () => {
    if (!res.writableFinished) proxyReq.destroy();
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: `Backend unreachable: ${err.message}` }));
    }
  });

  req.pipe(proxyReq);
}
