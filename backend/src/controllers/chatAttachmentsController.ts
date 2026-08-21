import { Response } from 'express';
import fs from 'fs';
import logger from '../logger';
import { extractText } from '../services/documents/extraction';
import { jsonError } from '../utils/httpJson';
import type { AuthRequest } from '../types/express';

const MAX_ATTACHMENT_CHARS = 12000;

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
]);

const ALLOWED_EXT = /\.(pdf|xlsx|txt|md)$/i;

export async function uploadChatAttachment(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const file = req.file as { path: string; mimetype: string; originalname: string } | undefined;
  if (!file) {
    jsonError(res, req, 400, 'File is required');
    return;
  }

  const mime = file.mimetype || '';
  const name = file.originalname || 'attachment';
  if (
    !ALLOWED_MIMES.has(mime) &&
    !ALLOWED_EXT.test(name)
  ) {
    jsonError(
      res,
      req,
      400,
      'Непідтримуваний формат. Дозволено: PDF, XLSX, TXT, MD'
    );
    return;
  }

  try {
    const buffer = fs.readFileSync(file.path);
    const text = (await extractText(buffer, mime, name)).trim();
    if (!text) {
      jsonError(res, req, 400, 'Не вдалося витягти текст із файлу');
      return;
    }

    let content = text;
    let truncated = false;
    if (content.length > MAX_ATTACHMENT_CHARS) {
      content = content.slice(0, MAX_ATTACHMENT_CHARS);
      truncated = true;
    }

    res.json({
      filename: name,
      content,
      chars: content.length,
      truncated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /chat/attachments error: ${message}`);
    jsonError(res, req, 500, 'Failed to process attachment');
  } finally {
    try {
      if (file.path) fs.unlinkSync(file.path);
    } catch (cleanupErr: unknown) {
      const code = (cleanupErr as NodeJS.ErrnoException)?.code;
      // ENOENT = already cleaned; other codes mean a leaked temp file.
      if (code !== 'ENOENT') {
        const message =
          cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        logger.warn(
          `chat attachment temp cleanup failed path=${file.path}: ${message}`
        );
      }
    }
  }
}
