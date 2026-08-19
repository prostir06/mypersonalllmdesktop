import prisma from '../../config/prisma';
import { truncateFailureReason } from './status';

const DEFAULT_STALE_MS = 10 * 60 * 1000;
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
