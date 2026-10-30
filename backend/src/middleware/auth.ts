import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthRequest } from '../types/express';
import { jsonError } from '../utils/httpJson';
import logger from '../logger';

const auth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      jsonError(res, req, 401, 'No token, authorization denied');
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string, {
      algorithms: ['HS256'],
    }) as { userId: number };
    req.userId = decoded.userId;
    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Auth verification failed: ${message}`);
    jsonError(res, req, 401, 'Token is not valid');
  }
};

export default auth;
