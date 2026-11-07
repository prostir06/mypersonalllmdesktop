import { NextFunction, Request, Response } from 'express';
import logger from '../logger';
import { requestContext } from '../requestContext';
import type { RequestWithId } from '../types/express';

/** Keep later logs on this request, then record status and duration once. */
function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req as RequestWithId).id || '-';
  const started = process.hrtime.bigint();
  let logged = false;

  const writeAccessLog = () => {
    if (logged) return;
    logged = true;
    const elapsedMs = Math.max(0, Math.round(Number(process.hrtime.bigint() - started) / 1_000_000));
    const url = req.path || '/';
    logger.child({ requestId }).info(`${req.method} ${url} ${res.statusCode} ${elapsedMs}ms`);
  };

  res.on('finish', writeAccessLog);
  res.on('close', () => {
    if (!res.writableFinished) writeAccessLog();
  });

  requestContext.run({ requestId }, () => next());
}

export default requestLogger;
