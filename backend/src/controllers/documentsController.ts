import { Request, Response } from 'express';
import DocumentService from '../services/DocumentService';
import logger from '../logger';
import { decodeMulterFilename } from '../utils/multerFilename';

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

    const result = await DocumentService.uploadAndProcess(req.file, req.userId!);
    res.status(201).json({
      document: result.document,
      chunksCount: result.chunksCount,
      message: 'Файл успішно опрацьовано та збережено для RAG',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /documents/upload error: ${message}`);

    if (message.includes('витягти текст')) {
      res.status(400).json({ error: message });
      return;
    }

    res.status(500).json({ error: `Помилка обробки файлу: ${message}` });
  }
}

export async function listDocuments(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const documents = await DocumentService.getByUser(req.userId!);
    res.json(documents);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /documents error: ${message}`);
    res.status(500).json({ error: 'Не вдалося отримати список документів' });
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
