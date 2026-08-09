/**
 * JSON error helpers that always attach requestId when present.
 */
import type { Request, Response } from 'express';

type ReqWithId = Request & { id?: string };

export function jsonError(
  res: Response,
  req: ReqWithId,
  status: number,
  error: string,
  extra: Record<string, unknown> = {}
): Response {
  return res.status(status).json({
    error,
    requestId: req.id,
    ...extra,
  });
}
