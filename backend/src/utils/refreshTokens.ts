import crypto from 'crypto';
import type { Response } from 'express';
import prisma from '../config/prisma';

export const REFRESH_COOKIE = 'refresh_token';

function refreshTtlMs(): number {
  const raw = process.env.JWT_REFRESH_EXPIRE || '30d';
  const match = /^(\d+)([smhd])$/i.exec(raw.trim());
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const mult =
    unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function cookieOptions() {
  const maxAge = refreshTtlMs();
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/api/auth',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
  };
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/auth',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function setRefreshCookie(res: Response, rawToken: string): void {
  res.cookie(REFRESH_COOKIE, rawToken, cookieOptions());
}

/** Create a new refresh token row; returns raw token for the cookie. */
export async function issueRefreshToken(userId: number): Promise<string> {
  const raw = crypto.randomBytes(48).toString('base64url');
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + refreshTtlMs());

  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return raw;
}

export async function rotateRefreshToken(
  rawToken: string
): Promise<{ userId: number; raw: string } | null> {
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!existing || existing.revokedAt || existing.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  const raw = await issueRefreshToken(existing.userId);
  return { userId: existing.userId, raw };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
