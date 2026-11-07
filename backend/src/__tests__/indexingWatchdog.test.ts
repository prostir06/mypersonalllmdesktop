jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    document: {
      updateMany: jest.fn(),
    },
  },
}));

import prisma from '../config/prisma';
import {
  documentWatchdogIntervalMs,
  failStalePendingDocuments,
  startDocumentWatchdog,
  getIndexingStaleMs,
} from '../services/documents/indexingWatchdog';

const mockedPrisma = prisma as unknown as {
  document: { updateMany: jest.Mock };
};

describe('indexingWatchdog', () => {
  const prev = process.env.DOCUMENT_INDEXING_STALE_MS;
  const prevInterval = process.env.DOCUMENT_WATCHDOG_INTERVAL_MS;

  afterEach(() => {
    if (prev === undefined) delete process.env.DOCUMENT_INDEXING_STALE_MS;
    else process.env.DOCUMENT_INDEXING_STALE_MS = prev;
    if (prevInterval === undefined) delete process.env.DOCUMENT_WATCHDOG_INTERVAL_MS;
    else process.env.DOCUMENT_WATCHDOG_INTERVAL_MS = prevInterval;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('uses 10 minutes by default', () => {
    delete process.env.DOCUMENT_INDEXING_STALE_MS;
    expect(getIndexingStaleMs()).toBe(10 * 60 * 1000);
  });

  it('marks pending docs older than cutoff as failed', async () => {
    mockedPrisma.document.updateMany.mockResolvedValue({ count: 2 });
    const now = Date.parse('2026-08-19T12:00:00.000Z');

    const count = await failStalePendingDocuments(now);

    expect(count).toBe(2);
    expect(mockedPrisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'pending',
        createdAt: { lt: new Date('2026-08-19T11:50:00.000Z') },
      },
      data: {
        status: 'failed',
        failureReason: 'Індексація перевищила час',
      },
    });
  });

  it('uses a 60s timer by default and does not run before the interval', async () => {
    delete process.env.DOCUMENT_WATCHDOG_INTERVAL_MS;
    expect(documentWatchdogIntervalMs()).toBe(60_000);
    jest.useFakeTimers();
    mockedPrisma.document.updateMany.mockResolvedValue({ count: 0 });
    const stop = startDocumentWatchdog(60_000);
    expect(mockedPrisma.document.updateMany).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(mockedPrisma.document.updateMany).toHaveBeenCalledTimes(1);
    stop();
  });
});
