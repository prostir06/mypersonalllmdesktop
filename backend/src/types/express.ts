import type { Request } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

export type AuthRequest = Request & {
  userId?: number;
  file?: { path: string; mimetype: string; originalname: string };
};
