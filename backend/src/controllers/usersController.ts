import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import logger from '../logger';
import { jsonError } from '../utils/httpJson';
import { clearRefreshCookie, revokeAllRefreshTokens } from '../utils/refreshTokens';
import type { AuthRequest } from '../types/express';

export function toPublicUser(row: {
  id: number;
  name: string;
  email: string;
  role?: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function passwordIsStrong(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
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
  const body = req.body as { name?: unknown; email?: unknown; currentPassword?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';

  if (!name) {
    jsonError(res, req, 400, 'Name is required');
    return;
  }
  if (!email || !email.includes('@') || !email.includes('.')) {
    jsonError(res, req, 400, 'Valid email is required');
    return;
  }

  try {
    const current = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { email: true, password: true },
    });
    if (!current) {
      jsonError(res, req, 404, 'User not found');
      return;
    }
    const emailChanged = email !== normalizeEmail(current.email);
    if (emailChanged) {
      if (!currentPassword) {
        jsonError(res, req, 400, 'Поточний пароль обовʼязковий');
        return;
      }
      const matches = await bcrypt.compare(currentPassword, current.password);
      if (!matches) {
        jsonError(res, req, 400, 'Невірний пароль');
        return;
      }
    }

    const row = await prisma.user.update({
      where: { id: req.userId! },
      data: { name, email },
      select: { id: true, name: true, email: true },
    });
    if (emailChanged) await revokeAllRefreshTokens(req.userId!);
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

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as { currentPassword?: unknown; newPassword?: unknown };
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!currentPassword || !passwordIsStrong(newPassword)) {
    jsonError(res, req, 400, 'Пароль: мін. 8 символів, одна велика літера та одна цифра');
    return;
  }

  try {
    const current = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { password: true },
    });
    if (!current) {
      jsonError(res, req, 404, 'User not found');
      return;
    }
    const matches = await bcrypt.compare(currentPassword, current.password);
    if (!matches) {
      jsonError(res, req, 400, 'Невірний пароль');
      return;
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.userId! },
      data: { password: hashed },
    });
    await revokeAllRefreshTokens(req.userId!);
    clearRefreshCookie(res);
    res.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /users/me/password error: ${message}`);
    jsonError(res, req, 500, 'Failed to update password');
  }
}
