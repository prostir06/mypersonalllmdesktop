import type { Request } from 'express';

/** Express Request plus middleware-attached request id (no global namespace merge). */
export type RequestWithId = Request & {
  id?: string;
};

export type AuthRequest = RequestWithId & {
  userId?: number;
  file?: { path: string; mimetype: string; originalname: string };
};
