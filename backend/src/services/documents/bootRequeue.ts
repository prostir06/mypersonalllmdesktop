import fs from 'fs/promises';
import prisma from '../../config/prisma';
import logger from '../../logger';
import { enqueueDocumentJob } from '../../utils/documentJobQueue';
import DocumentService from '../DocumentService';
import { failStalePendingDocuments, getIndexingStaleMs } from './indexingWatchdog';
import { truncateFailureReason } from './status';

const MISSING_STAGING = 'Файл індексації відсутній після перезапуску';

export type BootRequeueResult = {
  requeued: number;
  failed: number;
  staleFailed: number;
};

/**
 * On process start: fail aged pending docs, then requeue fresh pending
 * that still have a staging file on disk.
 */
export async function requeueOrFailStaleOnBoot(
  nowMs = Date.now()
): Promise<BootRequeueResult> {
  let staleFailed = 0;
  try {
    staleFailed = await failStalePendingDocuments(nowMs);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Boot indexing watchdog failed: ${message}`);
  }

  const cutoff = new Date(nowMs - getIndexingStaleMs());
  const pending = await prisma.document.findMany({
    where: {
      status: 'pending',
      createdAt: { gte: cutoff },
      stagingPath: { not: null },
    },
    select: {
      id: true,
      userId: true,
      filename: true,
      fileType: true,
      fileSize: true,
      stagingPath: true,
    },
  });

  let requeued = 0;
  let failed = 0;

  for (const doc of pending) {
    const stagingPath = doc.stagingPath;
    const reason = stagingPath
      ? await stagingFailureReason(stagingPath)
      : MISSING_STAGING;
    if (!stagingPath || reason) {
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          status: 'failed',
          failureReason: truncateFailureReason(reason ?? MISSING_STAGING),
        },
      });
      failed += 1;
      continue;
    }

    enqueueDocumentJob(async () => {
      try {
        await DocumentService.finalizeUpload(
          doc.id,
          doc.userId,
          {
            originalname: doc.filename,
            mimetype: doc.fileType,
            size: doc.fileSize,
          },
          stagingPath
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          `Boot requeue finalize failed id=${doc.id}: ${message}`
        );
      }
    });
    requeued += 1;
  }

  if (requeued || failed || staleFailed) {
    logger.info(
      `Document boot requeue: requeued=${requeued} failed=${failed} staleFailed=${staleFailed}`
    );
  }

  return { requeued, failed, staleFailed };
}

/** null when the file is readable. ENOENT is "missing"; other errors keep their message. */
async function stagingFailureReason(stagingPath: string): Promise<string | null> {
  try {
    await fs.access(stagingPath);
    return null;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return MISSING_STAGING;
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Boot requeue cannot read staging file ${stagingPath}: ${message}`);
    return message;
  }
}
