import { Request, Response, NextFunction } from 'express';
import logger from '../logger';
import type { RequestWithId } from '../types/express';

type HttpError = Error & { statusCode?: number };

const errorHandler = (
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = (req as RequestWithId).id;
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    requestId,
    timestamp: new Date().toISOString(),
  });

  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message;

  res.status(statusCode).json({
    error: message,
    requestId,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorHandler;
