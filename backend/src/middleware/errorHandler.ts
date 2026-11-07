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

  const multerCode = (err as { code?: string; name?: string }).code;
  const multerName = (err as { name?: string }).name;
  if (multerName === 'MulterError' || multerCode?.startsWith('LIMIT_')) {
    const statusCode = multerCode === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(statusCode).json({
      error: err.message,
      requestId,
    });
    return;
  }
  if (err.message.startsWith('Непідтримуваний формат')) {
    res.status(400).json({ error: err.message, requestId });
    return;
  }

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
