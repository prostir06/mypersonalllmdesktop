import prisma from '../../config/prisma';
import { utcDay } from '../usage/sharedKeys';

export class AdminError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AdminError';
  }
}

function money(value: unknown): number | null {
  if (value == null) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function utcMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function listDirectory() {
  const rows = await prisma.user.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      blocked: true,
      sharedKeyDailyLimitUsd: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    blocked: row.blocked,
    sharedKeyDailyLimitUsd: money(row.sharedKeyDailyLimitUsd),
    created_at: row.createdAt,
  }));
}

export async function updateDirectoryUser(
  actorId: number,
  userId: number,
  patch: {
    role?: 'admin' | 'member';
    blocked?: boolean;
    sharedKeyDailyLimitUsd?: number | null;
  }
) {
  if (actorId === userId && (patch.blocked === true || patch.role === 'member')) {
    throw new AdminError(400, 'Не можна зняти з себе права адміністратора');
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!current) throw new AdminError(404, 'Користувача не знайдено');

  if (patch.role === 'member' && current.role === 'admin') {
    const admins = await prisma.user.count({ where: { role: 'admin' } });
    if (admins <= 1) {
      throw new AdminError(400, 'Має лишитися хоча б один адміністратор');
    }
  }

  const data: {
    role?: 'admin' | 'member';
    blocked?: boolean;
    sharedKeyDailyLimitUsd?: number | null;
  } = {};
  if (patch.role) data.role = patch.role;
  if (typeof patch.blocked === 'boolean') data.blocked = patch.blocked;
  if (patch.sharedKeyDailyLimitUsd === null) data.sharedKeyDailyLimitUsd = null;
  else if (
    typeof patch.sharedKeyDailyLimitUsd === 'number' &&
    Number.isFinite(patch.sharedKeyDailyLimitUsd) &&
    patch.sharedKeyDailyLimitUsd >= 0
  ) {
    data.sharedKeyDailyLimitUsd = patch.sharedKeyDailyLimitUsd;
  }

  const row = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      blocked: true,
      sharedKeyDailyLimitUsd: true,
    },
  });

  if (patch.blocked === true) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return {
    ...row,
    sharedKeyDailyLimitUsd: money(row.sharedKeyDailyLimitUsd),
  };
}

export async function spendReport(period: 'day' | 'month', now = new Date()) {
  const start = period === 'day' ? utcDay(now) : utcMonthStart(now);
  const where =
    period === 'day'
      ? { date: start }
      : {
          date: {
            gte: start,
            lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
          },
        };
  const grouped = await prisma.usageLedger.groupBy({
    by: ['userId', 'provider', 'model'],
    where,
    _sum: { costUsd: true, promptTokens: true, completionTokens: true },
  });
  const ids = [...new Set(grouped.map((row) => row.userId))];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true },
      })
    : [];
  const emailById = new Map(users.map((user) => [user.id, user.email]));
  return {
    period,
    estimate: true as const,
    rows: grouped.map((row) => ({
      userId: row.userId,
      email: emailById.get(row.userId) || '',
      provider: row.provider,
      model: row.model,
      promptTokens: row._sum.promptTokens ?? 0,
      completionTokens: row._sum.completionTokens ?? 0,
      costUsd: Number(row._sum.costUsd ?? 0),
    })),
  };
}
