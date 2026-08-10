import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * Attach a request id (from X-Request-Id or generated UUID) and echo it on the response.
 */
function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id =
    incoming && typeof incoming === 'string' && incoming.trim()
      ? incoming.trim().slice(0, 128)
      : crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export = requestId;
