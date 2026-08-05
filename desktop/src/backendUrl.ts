/**
 * Resolve and validate backend origin for the local /api proxy.
 * Only http(s) to loopback or an explicit allowlist host.
 */
import { URL } from 'url';

const DEFAULT_BACKEND = 'http://127.0.0.1:5000';

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
}

export function resolveBackendOrigin(raw?: string): string {
  const input = (raw || process.env.BACKEND_URL || process.env.LLM_BACKEND_URL || DEFAULT_BACKEND).trim();
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid BACKEND_URL: ${input}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('BACKEND_URL must be http or https');
  }

  const allowExtra = (process.env.ELECTRON_BACKEND_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!isLoopbackHost(url.hostname) && !allowExtra.includes(url.hostname.toLowerCase())) {
    throw new Error(
      `BACKEND_URL host not allowed: ${url.hostname} (loopback or ELECTRON_BACKEND_ALLOWLIST)`
    );
  }

  // Origin only (no path) — we append /api/...
  return `${url.protocol}//${url.host}`;
}

export function uiPort(): number {
  const n = parseInt(process.env.ELECTRON_UI_PORT || '3911', 10);
  return Number.isFinite(n) && n > 0 ? n : 3911;
}
