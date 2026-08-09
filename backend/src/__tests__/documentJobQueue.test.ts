import {
  enqueueDocumentJob,
  getDocumentJobActiveCount,
  getDocumentJobConcurrency,
  resetDocumentJobQueue,
  runWithDocumentJobLimit,
} from '../utils/documentJobQueue';

describe('documentJobQueue', () => {
  const prev = process.env.DOCUMENT_JOB_CONCURRENCY;

  beforeEach(() => {
    resetDocumentJobQueue();
    process.env.DOCUMENT_JOB_CONCURRENCY = '1';
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.DOCUMENT_JOB_CONCURRENCY;
    else process.env.DOCUMENT_JOB_CONCURRENCY = prev;
    resetDocumentJobQueue();
  });

  it('reads concurrency from env', () => {
    expect(getDocumentJobConcurrency()).toBe(1);
  });

  it('runs at most N jobs concurrently', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r;
    });

    const started: number[] = [];
    const p1 = runWithDocumentJobLimit(async () => {
      started.push(1);
      await firstGate;
    });
    const p2 = runWithDocumentJobLimit(async () => {
      started.push(2);
    });

    await new Promise((r) => setImmediate(r));
    expect(started).toEqual([1]);
    expect(getDocumentJobActiveCount()).toBe(1);

    releaseFirst();
    await Promise.all([p1, p2]);
    expect(started).toEqual([1, 2]);
    expect(getDocumentJobActiveCount()).toBe(0);
  });

  it('enqueueDocumentJob schedules via setImmediate', async () => {
    let finished = false;
    const done = new Promise<void>((resolve) => {
      enqueueDocumentJob(async () => {
        finished = true;
        resolve();
      });
    });
    await done;
    await new Promise((r) => setImmediate(r));
    expect(finished).toBe(true);
    expect(getDocumentJobActiveCount()).toBe(0);
  });
});
