jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    usageLedger: {
      aggregate: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  warn: jest.fn(),
}));

import prisma from '../config/prisma';
import { ChatError } from '../services/chat/types';
import { assertSharedKeyQuota, recordUsage } from '../services/usage/quota';
import { QUOTA_EXCEEDED_CODE, QUOTA_EXCEEDED_MESSAGE } from '../services/usage/sharedKeys';

const user = (prisma as unknown as { user: { findUnique: jest.Mock } }).user;
const ledger = (prisma as unknown as {
  usageLedger: { aggregate: jest.Mock; create: jest.Mock };
}).usageLedger;

describe('shared key quota', () => {
  const previousLimit = process.env.SHARED_KEY_DAILY_LIMIT_USD;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SHARED_KEY_DAILY_LIMIT_USD;
  });

  afterAll(() => {
    if (previousLimit === undefined) delete process.env.SHARED_KEY_DAILY_LIMIT_USD;
    else process.env.SHARED_KEY_DAILY_LIMIT_USD = previousLimit;
  });

  it('does not read the ledger for a user-owned key', async () => {
    await assertSharedKeyQuota({ userId: 3, provider: 'openai', sharedKey: false });
    expect(ledger.aggregate).not.toHaveBeenCalled();
  });

  it('rejects with QUOTA_EXCEEDED when shared spend reaches the limit', async () => {
    user.findUnique.mockResolvedValue({ sharedKeyDailyLimitUsd: null });
    ledger.aggregate.mockResolvedValue({ _sum: { costUsd: 1 } });

    await expect(
      assertSharedKeyQuota({ userId: 3, provider: 'openai', sharedKey: true })
    ).rejects.toMatchObject({
      statusCode: 429,
      code: QUOTA_EXCEEDED_CODE,
      message: QUOTA_EXCEEDED_MESSAGE,
    });
    await expect(
      assertSharedKeyQuota({ userId: 3, provider: 'openai', sharedKey: true })
    ).rejects.toBeInstanceOf(ChatError);
  });

  it('uses the per-user override instead of the env default', async () => {
    user.findUnique.mockResolvedValue({ sharedKeyDailyLimitUsd: '0.25' });
    ledger.aggregate.mockResolvedValue({ _sum: { costUsd: '0.20' } });

    await expect(
      assertSharedKeyQuota({ userId: 3, provider: 'openai', sharedKey: true })
    ).resolves.toBeUndefined();

    ledger.aggregate.mockResolvedValue({ _sum: { costUsd: '0.25' } });
    await expect(
      assertSharedKeyQuota({ userId: 3, provider: 'openai', sharedKey: true })
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('writes a ledger row for the turn', async () => {
    ledger.create.mockResolvedValue({ id: 1 });

    await recordUsage({
      userId: 3,
      provider: 'openai',
      model: 'gpt-4o-mini',
      promptTokens: 10,
      completionTokens: 4,
      costUsd: 0.01,
      sharedKey: true,
    });

    expect(ledger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 3,
        provider: 'openai',
        model: 'gpt-4o-mini',
        promptTokens: 10,
        completionTokens: 4,
        costUsd: 0.01,
        sharedKey: true,
      }),
    });
  });
});
