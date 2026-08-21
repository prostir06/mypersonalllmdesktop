import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

type HttpError = Error & { statusCode?: number };

const errorHandler = (
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    requestId: req.id,
    timestamp: new Date().toISOString(),
  });

  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message;

  res.status(statusCode).json({
    error: message,
    requestId: req.id,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorHandler;
