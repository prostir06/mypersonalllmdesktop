import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export type AuthRequest = Request & { userId?: number };
