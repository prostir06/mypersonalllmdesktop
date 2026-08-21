import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthRequest } from '../types/express';

/** Decode JWT if present but never reject — unauthenticated callers get defaults. */
const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const secret = process.env.JWT_SECRET;
      if (secret) {
        const decoded = jwt.verify(token, secret, {
          algorithms: ['HS256'],
        }) as { userId: number };
        req.userId = decoded.userId;
      }
    } catch {
      // Invalid token — proceed as unauthenticated.
    }
  }
  next();
};

export default optionalAuth;
