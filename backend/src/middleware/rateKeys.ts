import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { jwtVerifyOptions } from '../auth/jwtClaims';
import { hashPii } from '../utils/pii';

export function loginRateKey(req: Pick<Request, 'body' | 'ip'>): string {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email) return `login:${hashPii(email)}`;
  return `ip:${req.ip || 'unknown'}`;
}

export function chatRateKey(req: Pick<Request, 'ip'> & { header(name: string): string | undefined }): string {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const secret = process.env.JWT_SECRET;
  if (token && secret) {
    try {
      const decoded = jwt.verify(token, secret, jwtVerifyOptions()) as { userId?: unknown };
      if (typeof decoded.userId === 'number') return `user:${decoded.userId}`;
    } catch {
      /* unsigned or expired tokens share the IP bucket */
    }
  }
  return `ip:${req.ip || 'unknown'}`;
}
