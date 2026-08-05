import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Abort when the HTTP client disconnects before the response finishes.
 * Normal completion (writableEnded) does not abort.
 */
export function bindClientAbortSignal(
  req: Pick<IncomingMessage, 'on'>,
  res: Pick<ServerResponse, 'on'> & { writableEnded: boolean }
): AbortSignal {
  const ac = new AbortController();

  const abortIfClientGone = () => {
    if (!res.writableEnded && !ac.signal.aborted) {
      ac.abort();
    }
  };

  req.on('close', abortIfClientGone);
  req.on('aborted', abortIfClientGone);

  return ac.signal;
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  const code = (error as { code?: string }).code;
  return name === 'AbortError' || code === 'ERR_CANCELED' || code === 'ABORT_ERR';
}
