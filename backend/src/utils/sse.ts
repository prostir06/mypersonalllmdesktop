import { Response } from 'express';
import logger from '../logger';

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
