import logger from '../logger';

/**
 * In-process semaphore for background document finalize jobs.
 * Caps concurrent parse/embed work (personal deploy — no Redis required).
 */

let active = 0;
let pendingStart = 0;
const waiters: Array<() => void> = [];

export class DocumentQueueFullError extends Error {
  constructor() {
    super('Черга індексації переповнена');
    this.name = 'DocumentQueueFullError';
  }
}

export function getDocumentJobConcurrency(): number {
  const n = parseInt(process.env.DOCUMENT_JOB_CONCURRENCY || '2', 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 16) : 2;
}

export function getDocumentJobQueueDepth(): number {
  const n = parseInt(process.env.DOCUMENT_JOB_QUEUE_DEPTH || '32', 10);
  const depth = Number.isFinite(n) && n >= 1 ? Math.min(n, 1000) : 32;
  return Math.max(depth, getDocumentJobConcurrency());
}

/** Test helper */
export function resetDocumentJobQueue(): void {
  active = 0;
  pendingStart = 0;
  waiters.length = 0;
}

/** Test helper */
export function getDocumentJobActiveCount(): number {
  return active;
}

function acquire(): Promise<void> {
  if (active < getDocumentJobConcurrency()) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

export async function runWithDocumentJobLimit(
  job: () => void | Promise<void>
): Promise<void> {
  await acquire();
  try {
    await job();
  } finally {
    release();
  }
}

export function enqueueDocumentJob(job: () => void | Promise<void>): boolean {
  if (active + waiters.length + pendingStart >= getDocumentJobQueueDepth()) {
    return false;
  }
  pendingStart += 1;
  setImmediate(() => {
    pendingStart = Math.max(0, pendingStart - 1);
    void runWithDocumentJobLimit(job).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`documentJobQueue: background job failed: ${message}`);
    });
  });
  return true;
}
