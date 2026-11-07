jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    refreshToken: { deleteMany: jest.fn() },
    pendingToolAction: { deleteMany: jest.fn() },
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import prisma from '../config/prisma';
import logger from '../logger';
import {
  maintenanceIntervalMs,
  pruneExpired,
  startMaintenance,
} from '../services/maintenance/pruneExpired';

const mocked = prisma as unknown as {
  refreshToken: { deleteMany: jest.Mock };
  pendingToolAction: { deleteMany: jest.Mock };
};

describe('pruneExpired', () => {
  const prev = process.env.MAINTENANCE_INTERVAL_MS;

  afterEach(() => {
    if (prev === undefined) delete process.env.MAINTENANCE_INTERVAL_MS;
    else process.env.MAINTENANCE_INTERVAL_MS = prev;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('deletes rows past expires_at', async () => {
    mocked.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    mocked.pendingToolAction.deleteMany.mockResolvedValue({ count: 1 });
    const now = new Date('2026-11-07T00:00:00.000Z');

    await expect(pruneExpired(now)).resolves.toEqual({
      refreshTokens: 2,
      toolActions: 1,
    });
    expect(mocked.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(mocked.pendingToolAction.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
  });

  it('defaults the interval to one hour', () => {
    delete process.env.MAINTENANCE_INTERVAL_MS;
    expect(maintenanceIntervalMs()).toBe(60 * 60 * 1000);
  });

  it('runs once immediately and again on the interval', async () => {
    jest.useFakeTimers();
    const run = jest.fn().mockResolvedValue({ refreshTokens: 1, toolActions: 0 });
    const stop = startMaintenance(run, 60_000);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      'Maintenance prune: refreshTokens=1 toolActions=0'
    );
    await jest.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });
});
