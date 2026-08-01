import { Request, Response } from 'express';
import prisma from '../config/prisma';
import logger from '../logger';

type AuthRequest = Request & { userId?: number };

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
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(toPublicUser(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /users/me error: ${message}`);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

export async function updateMe(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as { name?: unknown; email?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';

  if (!name) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
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
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
    // Prisma P2025 = record not found on update
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`PUT /users/me error: ${message}`);
    res.status(500).json({ error: 'Failed to update user' });
  }
}
