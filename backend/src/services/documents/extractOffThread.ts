import path from 'path';
import { Worker } from 'worker_threads';

type WorkerResult = { ok: true; text: string } | { ok: false; message: string };

function workerLaunch(): { filename: string; execArgv: string[] } {
  if (__filename.endsWith('.ts')) {
    return {
      filename: path.join(__dirname, 'extractionWorker.ts'),
      execArgv: ['-r', 'ts-node/register'],
    };
  }
  return {
    filename: path.join(__dirname, 'extractionWorker.js'),
    execArgv: [],
  };
}

/** Run document extraction off the request thread. */
export function extractTextOffThread(
  buffer: Buffer,
  mimetype: string,
  originalname: string
): Promise<string> {
  const launch = workerLaunch();
  return new Promise((resolve, reject) => {
    const worker = new Worker(launch.filename, {
      execArgv: launch.execArgv,
      workerData: {
        buffer,
        mimetype,
        originalname,
      },
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: '1' },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Витяг тексту перевищив ліміт часу'));
    }, 120_000);
    worker.once('message', (result: WorkerResult) => {
      clearTimeout(timer);
      if (result.ok) resolve(result.text);
      else reject(new Error(result.message));
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Потік витягу тексту завершився з кодом ${code}`));
      }
    });
  });
}
