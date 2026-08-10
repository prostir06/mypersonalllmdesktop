import { Request, Response } from 'express';
import DocumentService from '../services/DocumentService';
import logger from '../logger';
import { decodeMulterFilename } from '../utils/multerFilename';
import { parseListPagination } from '../utils/listPagination';
import { jsonError } from '../utils/httpJson';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type AuthRequest = Request & {
  userId?: number;
  id?: string;
  file?: UploadedFile;
};

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function publicUploadError(
  req: AuthRequest,
  publicError: string,
  details: string
): string {
  if (isProduction()) return publicError;
  return `${publicError}: ${details}`;
}

export async function uploadDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  if (!req.file) {
    jsonError(res, req, 400, 'Будь ласка, виберіть файл для завантаження');
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
      requestId: req.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /documents/upload error: ${message}`);

    if (message.includes('ліміт розміру')) {
      jsonError(res, req, 400, message);
      return;
    }

    jsonError(
      res,
      req,
      500,
      publicUploadError(req, 'Помилка обробки файлу', message)
    );
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
    jsonError(res, req, 500, 'Не вдалося отримати список документів');
  }
}

export async function getDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!/^\d+$/.test(String(req.params.id))) {
      jsonError(res, req, 400, 'Некоректний ідентифікатор документа');
      return;
    }

    const doc = await DocumentService.getById(Number(req.params.id), req.userId!);
    if (!doc) {
      jsonError(res, req, 404, 'Документ не знайдено');
      return;
    }

    res.json(doc);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /documents/${req.params.id} error: ${message}`);
    jsonError(res, req, 500, 'Не вдалося отримати документ');
  }
}

export async function deleteDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!/^\d+$/.test(String(req.params.id))) {
      jsonError(res, req, 400, 'Некоректний ідентифікатор документа');
      return;
    }

    const docId = Number(req.params.id);
    const deleted = await DocumentService.delete(docId, req.userId!);

    if (!deleted) {
      jsonError(
        res,
        req,
        404,
        'Документ не знайдено або у вас немає прав на його видалення'
      );
      return;
    }

    res.json({ success: true, message: 'Документ успішно видалено' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`DELETE /documents/${req.params.id} error: ${message}`);
    jsonError(res, req, 500, 'Не вдалося видалити документ');
  }
}

export async function getDocumentChunks(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!/^\d+$/.test(String(req.params.id))) {
      jsonError(res, req, 400, 'Некоректний ідентифікатор документа');
      return;
    }

    const { limit, offset } = parseListPagination(req.query, { limit: 5 });
    const result = await DocumentService.getChunks(
      Number(req.params.id),
      req.userId!,
      limit,
      offset
    );

    if (!result) {
      jsonError(res, req, 404, 'Документ не знайдено');
      return;
    }

    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /documents/${req.params.id}/chunks error: ${message}`);
    jsonError(res, req, 500, 'Не вдалося отримати фрагменти документа');
  }
}

export async function reindexDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!/^\d+$/.test(String(req.params.id))) {
      jsonError(res, req, 400, 'Некоректний ідентифікатор документа');
      return;
    }

    const result = await DocumentService.reindexEmbeddings(
      Number(req.params.id),
      req.userId!
    );

    if (!result) {
      jsonError(res, req, 404, 'Документ не знайдено або не готовий до переіндексації');
      return;
    }

    res.json({
      document: result.document,
      embeddings_count: result.embeddingsCount,
      message: 'Embeddings оновлено',
      requestId: req.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /documents/${req.params.id}/reindex error: ${message}`);

    if (
      message.includes('провайдера embeddings') ||
      message.includes('фрагментів') ||
      message.includes('embeddings')
    ) {
      jsonError(res, req, 409, message);
      return;
    }

    jsonError(res, req, 500, 'Не вдалося переіндексувати документ');
  }
}

export async function retryDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!/^\d+$/.test(String(req.params.id))) {
      jsonError(res, req, 400, 'Некоректний ідентифікатор документа');
      return;
    }

    const result = await DocumentService.retryIndexing(
      Number(req.params.id),
      req.userId!
    );

    if (!result) {
      jsonError(res, req, 404, 'Документ не знайдено або не у статусі failed');
      return;
    }

    res.status(202).json({
      document: result.document,
      status: 'pending',
      message: 'Повторну індексацію поставлено в чергу',
      requestId: req.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /documents/${req.params.id}/retry error: ${message}`);

    if (message.includes('повторної індексації')) {
      jsonError(res, req, 409, message);
      return;
    }

    jsonError(res, req, 500, 'Не вдалося повторити індексацію');
  }
}
