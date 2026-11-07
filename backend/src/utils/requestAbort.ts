import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Abort when the HTTP client disconnects before the response finishes.
 * Normal completion (writableEnded) does not abort.
 */
export function bindClientAbortSignal(
  _req: Pick<IncomingMessage, 'on'>,
  res: Pick<ServerResponse, 'on'> & { writableEnded: boolean }
): AbortSignal {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded && !ac.signal.aborted) {
      ac.abort();
    }
  });
  return ac.signal;
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  const code = (error as { code?: string }).code;
  return name === 'AbortError' || code === 'ERR_CANCELED' || code === 'ABORT_ERR';
}
