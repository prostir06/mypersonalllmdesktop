import { Request, Response } from 'express';
import DocumentService from '../services/DocumentService';
import logger from '../logger';
import { decodeMulterFilename } from '../utils/multerFilename';
import { parseListPagination } from '../utils/listPagination';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type AuthRequest = Request & {
  userId?: number;
  file?: UploadedFile;
};

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Build upload error JSON for clients.
 * Production: public message only (no paths / stack / internals).
 * Other envs: append details to speed up local debugging.
 */
function publicUploadError(
  publicError: string,
  details: string
): { error: string } {
  if (isProduction()) return { error: publicError };
  return { error: `${publicError}: ${details}` };
}

export async function uploadDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: 'Будь ласка, виберіть файл для завантаження' });
    return;
  }

  try {
    if (req.file.originalname) {
      req.file.originalname = decodeMulterFilename(req.file.originalname);
    }

    const result = await DocumentService.acceptUpload(req.file, req.userId!);
    res.status(202).json({
      document: result.document,
      status: 'pending',
      message: 'Файл прийнято. Індексація виконується у фоні',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /documents/upload error: ${message}`);

    if (message.includes('ліміт розміру')) {
      res.status(400).json({ error: message });
      return;
    }

    res.status(500).json(publicUploadError('Помилка обробки файлу', message));
  }
}

export async function listDocuments(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const { limit, offset } = parseListPagination(req.query);
    const result = await DocumentService.getByUser(req.userId!, limit, offset);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /documents error: ${message}`);
    res.status(500).json({ error: 'Не вдалося отримати список документів' });
  }
}

export async function getDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!/^\d+$/.test(String(req.params.id))) {
      res.status(400).json({ error: 'Некоректний ідентифікатор документа' });
      return;
    }

    const doc = await DocumentService.getById(Number(req.params.id), req.userId!);
    if (!doc) {
      res.status(404).json({ error: 'Документ не знайдено' });
      return;
    }

    res.json(doc);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /documents/${req.params.id} error: ${message}`);
    res.status(500).json({ error: 'Не вдалося отримати документ' });
  }
}

export async function deleteDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!/^\d+$/.test(String(req.params.id))) {
      res.status(400).json({ error: 'Некоректний ідентифікатор документа' });
      return;
    }

    const docId = Number(req.params.id);
    const deleted = await DocumentService.delete(docId, req.userId!);

    if (!deleted) {
      res
        .status(404)
        .json({ error: 'Документ не знайдено або у вас немає прав на його видалення' });
      return;
    }

    res.json({ success: true, message: 'Документ успішно видалено' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`DELETE /documents/${req.params.id} error: ${message}`);
    res.status(500).json({ error: 'Не вдалося видалити документ' });
  }
}
