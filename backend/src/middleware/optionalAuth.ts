import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthRequest } from '../types/express';
import logger from '../logger';
import { jwtVerifyOptions } from '../auth/jwtClaims';

/** Decode JWT if present but never reject — unauthenticated callers get defaults. */
const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const secret = process.env.JWT_SECRET;
      if (secret) {
        const decoded = jwt.verify(token, secret, jwtVerifyOptions()) as { userId: number };
        req.userId = decoded.userId;
      }
    } catch (err: unknown) {
      // Invalid/expired token — log for diagnostics and proceed unauthenticated
      const message = err instanceof Error ? err.message : String(err);
      logger.debug(`optionalAuth: token verification failed: ${message}`);
    }
  }
  next();
};

export default optionalAuth;
