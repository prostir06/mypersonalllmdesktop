import { Request, Response } from 'express';
import prisma from '../config/prisma';
import logger from '../logger';
import { jsonError } from '../utils/httpJson';

type AuthRequest = Request & { userId?: number; id?: string };

export function toPublicUser(row: {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    created_at: row.createdAt,
  };
}

export function toPublicUserUpdate(row: {
  id: number;
  name: string;
  email: string;
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
  };
}

function isValidEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    if (!row) {
      jsonError(res, req, 404, 'User not found');
      return;
    }
    res.json(toPublicUser(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /users/me error: ${message}`);
    jsonError(res, req, 500, 'Failed to fetch user');
  }
}

export async function updateMe(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as { name?: unknown; email?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';

  if (!name) {
    jsonError(res, req, 400, 'Name is required');
    return;
  }
  if (!email || !isValidEmail(email)) {
    jsonError(res, req, 400, 'Valid email is required');
    return;
  }

  try {
    const row = await prisma.user.update({
      where: { id: req.userId! },
      data: { name, email },
      select: { id: true, name: true, email: true },
    });
    res.json(toPublicUserUpdate(row));
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'P2002') {
      jsonError(res, req, 409, 'Email already in use');
      return;
    }
    if (err?.code === 'P2025') {
      jsonError(res, req, 404, 'User not found');
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`PUT /users/me error: ${message}`);
    jsonError(res, req, 500, 'Failed to update user');
  }
}
