import { parentPort, workerData } from 'worker_threads';
import { extractText } from './extraction';

type Job = {
  buffer: Uint8Array;
  mimetype: string;
  originalname: string;
};

async function main(): Promise<void> {
  const job = workerData as Job;
  try {
    const text = await extractText(
      Buffer.from(job.buffer),
      job.mimetype,
      job.originalname
    );
    parentPort?.postMessage({ ok: true, text });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    parentPort?.postMessage({ ok: false, message });
  }
}

void main();
