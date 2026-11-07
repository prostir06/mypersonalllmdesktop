import crypto from 'crypto';
import prisma from '../../config/prisma';

const DEFAULT_TTL_HOURS = 72;
const MAX_TTL_HOURS = 24 * 14;

export function hashInviteToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function inviteExpiry(ttlHours: number | undefined, now = new Date()): Date {
  const requested = Number(ttlHours);
  const hours =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_TTL_HOURS)
      : DEFAULT_TTL_HOURS;
  return new Date(now.getTime() + hours * 3_600_000);
}

export async function createInvite(createdById: number, ttlHours?: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = inviteExpiry(ttlHours);
  await prisma.invite.create({
    data: { tokenHash: hashInviteToken(token), expiresAt, createdById },
  });
  return { token, expiresAt };
}

export async function listInvites() {
  return prisma.invite.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, expiresAt: true, usedAt: true, createdAt: true },
  });
}

export async function claimInvite(raw: string): Promise<boolean> {
  const token = raw.trim();
  if (!token) return false;
  const claimed = await prisma.invite.updateMany({
    where: {
      tokenHash: hashInviteToken(token),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1;
}

export async function releaseInvite(raw: string): Promise<void> {
  const token = raw.trim();
  if (!token) return;
  await prisma.invite.updateMany({
    where: { tokenHash: hashInviteToken(token), usedAt: { not: null } },
    data: { usedAt: null },
  });
}
