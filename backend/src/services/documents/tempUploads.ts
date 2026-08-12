const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
import logger from '../../logger';

const UPLOADS_DIR = path.join(__dirname, '../../../uploads');

async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export async function writeTempUpload(buffer: Buffer): Promise<string> {
  await ensureUploadsDir();
  const tempPath = path.join(UPLOADS_DIR, `pending-${randomUUID()}`);
  await fs.writeFile(tempPath, buffer);
  return tempPath;
}

export async function deleteTempUpload(tempPath: string | null): Promise<void> {
  if (!tempPath) return;
  try {
    await fs.unlink(tempPath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Failed to delete temp upload ${tempPath}: ${message}`);
    }
  }
}
