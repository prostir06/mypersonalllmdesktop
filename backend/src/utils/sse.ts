import { Response } from 'express';
import logger from '../logger';

export const SSE_PING_MS = 15_000;

/** Start an SSE response immediately and keep proxies from buffering it. */
export function beginSseStream(res: Response, pingMs = SSE_PING_MS): () => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const timer = setInterval(() => {
    try {
      if (res.writableEnded) return;
      res.write(':ping\n\n');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`SSE ping skipped (client closed?): ${message}`);
    }
  }, pingMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

/** Write one SSE data frame; ignore client disconnect so handler finishes cleanly. */
export function writeSse(res: Response, payload: unknown): void {
  try {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`SSE write skipped (client closed?): ${message}`);
  }
}

/** Write a named SSE event frame; catches stream termination on abrupt client disconnect. */
export function writeSseEvent(
  res: Response,
  event: string,
  payload: unknown
): void {
  try {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`SSE event "${event}" write skipped (client closed?): ${message}`);
  }
}
