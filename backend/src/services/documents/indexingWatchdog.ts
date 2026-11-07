import prisma from '../../config/prisma';
import logger from '../../logger';
import { truncateFailureReason } from './status';

const DEFAULT_STALE_MS = 10 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 1000;
const STALE_REASON = 'Індексація перевищила час';

export function getIndexingStaleMs(): number {
  const n = parseInt(process.env.DOCUMENT_INDEXING_STALE_MS || '', 10);
  return Number.isFinite(n) && n >= 60_000 ? n : DEFAULT_STALE_MS;
}

/** Mark pending documents whose createdAt is older than the stale window. */
export async function failStalePendingDocuments(
  nowMs = Date.now()
): Promise<number> {
  const cutoff = new Date(nowMs - getIndexingStaleMs());
  const result = await prisma.document.updateMany({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
    },
    data: {
      status: 'failed',
      failureReason: truncateFailureReason(STALE_REASON),
    },
  });
  return result.count;
}

export function documentWatchdogIntervalMs(): number {
  const n = parseInt(process.env.DOCUMENT_WATCHDOG_INTERVAL_MS || '', 10);
  return Number.isFinite(n) && n >= 10_000 ? n : DEFAULT_INTERVAL_MS;
}

/** Fail stale pending documents on a timer. Listing documents does not call this. */
export function startDocumentWatchdog(
  intervalMs = documentWatchdogIntervalMs()
): () => void {
  const timer = setInterval(() => {
    void failStalePendingDocuments().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Indexing watchdog skipped: ${message}`);
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}
