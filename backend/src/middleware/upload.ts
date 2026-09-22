import path from 'path';
import fs from 'fs';
import { getMaxUploadBytes } from '../utils/fileMagic';

const multer = require('multer');

export type UploadMiddlewareOptions = {
  /** Subfolder under backend/uploads (e.g. `chat-temp`). */
  subdirectory?: string;
  /** Reject unsupported MIME/extensions (documents + chat attachments). */
  applyTypeFilter?: boolean;
};

type MulterFile = { mimetype: string; originalname: string };
type MulterCb = (error: Error | null, value?: boolean | string) => void;

export function getUploadsDir(subdirectory?: string): string {
  const parts = [path.resolve(__dirname, '..', '..', 'uploads')];
  if (subdirectory) parts.push(subdirectory);
  const uploadsDir = path.join(...parts);
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  return uploadsDir;
}

export function createUploadMiddleware(options: UploadMiddlewareOptions = {}) {
  const { subdirectory, applyTypeFilter = false } = options;
  const uploadsDir = getUploadsDir(subdirectory);

  const storage = multer.diskStorage({
    destination: (
      _req: unknown,
      _file: unknown,
      cb: (err: Error | null, dest: string) => void
    ) => {
      cb(null, uploadsDir);
    },
    filename: (
      _req: unknown,
      file: { originalname: string },
      cb: (err: Error | null, name: string) => void
    ) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}-${file.originalname}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: getMaxUploadBytes() },
    fileFilter: applyTypeFilter
      ? (_req: unknown, file: MulterFile, cb: MulterCb) => {
          try {
            const allowedMimeTypes = [
              'application/pdf',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'text/plain',
              'text/markdown',
            ];

            if (
              allowedMimeTypes.includes(file.mimetype) ||
              (file.originalname &&
                file.originalname.match(/\.(pdf|docx|xlsx|txt|md)$/i))
            ) {
              cb(null, true);
            } else {
              cb(
                new Error(
                  'Непідтримуваний формат файлу. Дозволено: PDF, DOCX, XLSX, TXT, MD'
                )
              );
            }
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            cb(new Error(`Помилка при перевірці файлу: ${message}`));
          }
        }
      : undefined,
  });
}
