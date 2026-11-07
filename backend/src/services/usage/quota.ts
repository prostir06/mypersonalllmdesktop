import prisma from '../../config/prisma';
import logger from '../../logger';
import { ChatError } from '../chat/types';
import { resolveProviderKeyDetail } from '../providers/resolveProviderKey';
import {
  QUOTA_EXCEEDED_CODE,
  QUOTA_EXCEEDED_MESSAGE,
  sharedKeyDailyLimitUsd,
  utcDay,
} from './sharedKeys';

function money(value: unknown): number {
  if (value == null) return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export async function assertSharedKeyQuota(input: {
  userId: number;
  provider?: string | null;
  sharedKey?: boolean;
}): Promise<void> {
  const shared =
    input.sharedKey === undefined
      ? (await resolveProviderKeyDetail(input.userId, input.provider)).shared
      : input.sharedKey;
  if (!shared) return;

  const [user, spent] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { sharedKeyDailyLimitUsd: true },
    }),
    prisma.usageLedger.aggregate({
      where: { userId: input.userId, sharedKey: true, date: utcDay() },
      _sum: { costUsd: true },
    }),
  ]);
  const limit =
    user?.sharedKeyDailyLimitUsd == null
      ? sharedKeyDailyLimitUsd()
      : money(user.sharedKeyDailyLimitUsd);
  if (money(spent._sum.costUsd) >= limit) {
    throw new ChatError(429, QUOTA_EXCEEDED_MESSAGE, { code: QUOTA_EXCEEDED_CODE });
  }
}

export async function recordUsage(entry: {
  userId: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  sharedKey: boolean;
}): Promise<void> {
  try {
    await prisma.usageLedger.create({
      data: {
        userId: entry.userId,
        date: utcDay(),
        provider: entry.provider,
        model: entry.model,
        promptTokens: Math.max(0, Math.trunc(entry.promptTokens || 0)),
        completionTokens: Math.max(0, Math.trunc(entry.completionTokens || 0)),
        costUsd: Number.isFinite(entry.costUsd) ? entry.costUsd : 0,
        sharedKey: entry.sharedKey,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`usage ledger write failed: ${message}`);
  }
}
