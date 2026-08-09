/**
 * Restrict outbound HTTP(S) URLs used for Ollama / remote model discovery.
 * Default allowlist: loopback, host.docker.internal, plus OLLAMA_URL_ALLOWLIST.
 * After hostname allowlist, optionally resolve DNS and reject link-local / metadata.
 */

import dns from 'dns/promises';
import net from 'net';

export class UrlNotAllowedError extends Error {
  statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'UrlNotAllowedError';
  }
}

const DEFAULT_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'host.docker.internal',
]);

function extraAllowedHosts(): Set<string> {
  const raw = process.env.OLLAMA_URL_ALLOWLIST || '';
  const hosts = new Set<string>();
  for (const part of raw.split(',')) {
    const h = part.trim().toLowerCase();
    if (h) hosts.add(h);
  }
  return hosts;
}

function isLoopbackIp(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === '127.0.0.1' || h === '::1' || h === 'localhost') return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

function isBlockedIp(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '');
  // Link-local / cloud metadata ranges commonly abused for SSRF
  if (h === '169.254.169.254' || h.startsWith('169.254.')) return true;
  if (h === 'metadata.google.internal') return true;
  return false;
}

/** Post-DNS: reject link-local / metadata even if hostname was allowlisted. */
export function isUnsafeResolvedAddress(ip: string): boolean {
  const h = ip.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h) return true;
  if (h === '0.0.0.0' || h === '::') return true;
  if (h === '169.254.169.254' || h.startsWith('169.254.')) return true;
  if (h.startsWith('fe80:')) return true;
  return false;
}

/**
 * Parse and validate an HTTP(S) URL for outbound provider calls.
 * Returns the parsed URL on success; throws UrlNotAllowedError otherwise.
 */
export function assertAllowedHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlNotAllowedError('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlNotAllowedError('URL scheme is not allowed');
  }

  const hostname = url.hostname.toLowerCase();

  if (isBlockedIp(hostname)) {
    throw new UrlNotAllowedError('URL host is not allowed');
  }

  if (isLoopbackIp(hostname) || DEFAULT_HOSTS.has(hostname)) {
    return url;
  }

  if (extraAllowedHosts().has(hostname)) {
    return url;
  }

  throw new UrlNotAllowedError('URL host is not allowed');
}

/**
 * Hostname allowlist + DNS resolution check (blocks link-local / metadata IPs).
 */
export async function assertAllowedHttpUrlWithDns(raw: string): Promise<URL> {
  const url = assertAllowedHttpUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(host)) {
    if (isUnsafeResolvedAddress(host)) {
      throw new UrlNotAllowedError('URL host resolved to a blocked address');
    }
    return url;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UrlNotAllowedError('URL host could not be resolved');
  }

  if (!addresses.length) {
    throw new UrlNotAllowedError('URL host could not be resolved');
  }

  for (const { address } of addresses) {
    if (isUnsafeResolvedAddress(address)) {
      throw new UrlNotAllowedError('URL host resolved to a blocked address');
    }
  }

  return url;
}
