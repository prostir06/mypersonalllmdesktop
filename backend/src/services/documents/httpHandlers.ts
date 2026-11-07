import { Response } from 'express';
import DocumentService from '../DocumentService';
import logger from '../../logger';
import { decodeMulterFilename } from '../../utils/multerFilename';
import { parseListPagination } from '../../utils/listPagination';
import { jsonError } from '../../utils/httpJson';
import type { AuthRequest } from '../../types/express';
import { parseDocumentStatusIds } from './statusIds';
import { deleteTempUpload } from './tempUploads';
import {
  requireDocumentId,
  withDocErrors,
  publicUploadError,
  classifyReindexError,
  classifyRetryError,
} from './httpErrors';

type DocAuthRequest = AuthRequest & {
  file?: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer?: Buffer;
    path?: string;
  };
};

export async function uploadDocument(
  req: DocAuthRequest,
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
    await deleteTempUpload(req.file.path ?? null);
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
      publicUploadError(
        process.env.NODE_ENV === 'production',
        'Помилка обробки файлу',
        message
      )
    );
  }
}

export async function listDocuments(
  req: AuthRequest,
  res: Response
): Promise<void> {
  await withDocErrors(
    req,
    res,
    'GET /documents error',
    'Не вдалося отримати список документів',
    async () => {
      const { limit, offset } = parseListPagination(req.query);
      res.json(await DocumentService.getByUser(req.userId!, limit, offset));
    }
  );
}

export async function getDocumentStatuses(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const ids = parseDocumentStatusIds(req.query.ids);
  if (ids == null) {
    jsonError(res, req, 400, 'Некоректний список документів');
    return;
  }
  if (ids.length === 0) {
    res.json({ items: [] });
    return;
  }
  await withDocErrors(
    req,
    res,
    'GET /documents/status error',
    'Не вдалося отримати статус документів',
    async () => {
      res.json({ items: await DocumentService.getStatuses(req.userId!, ids) });
    }
  );
}

export async function getDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  await withDocErrors(
    req,
    res,
    `GET /documents/${req.params.id} error`,
    'Не вдалося отримати документ',
    async () => {
      const id = requireDocumentId(req, res);
      if (id == null) return;
      const doc = await DocumentService.getById(id, req.userId!);
      if (!doc) {
        jsonError(res, req, 404, 'Документ не знайдено');
        return;
      }
      res.json(doc);
    }
  );
}

export async function deleteDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  await withDocErrors(
    req,
    res,
    `DELETE /documents/${req.params.id} error`,
    'Не вдалося видалити документ',
    async () => {
      const id = requireDocumentId(req, res);
      if (id == null) return;
      const deleted = await DocumentService.delete(id, req.userId!);
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
    }
  );
}

export async function getDocumentChunks(
  req: AuthRequest,
  res: Response
): Promise<void> {
  await withDocErrors(
    req,
    res,
    `GET /documents/${req.params.id}/chunks error`,
    'Не вдалося отримати фрагменти документа',
    async () => {
      const id = requireDocumentId(req, res);
      if (id == null) return;
      const { limit, offset } = parseListPagination(req.query, { limit: 5 });
      const result = await DocumentService.getChunks(
        id,
        req.userId!,
        limit,
        offset
      );
      if (!result) {
        jsonError(res, req, 404, 'Документ не знайдено');
        return;
      }
      res.json(result);
    }
  );
}

export async function reindexDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const id = requireDocumentId(req, res);
    if (id == null) return;
    const result = await DocumentService.reindexEmbeddings(id, req.userId!);
    if (!result) {
      jsonError(
        res,
        req,
        404,
        'Документ не знайдено або не готовий до переіндексації'
      );
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
    const classified = classifyReindexError(error);
    jsonError(res, req, classified.status, classified.message);
  }
}

export async function retryDocument(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const id = requireDocumentId(req, res);
    if (id == null) return;
    const result = await DocumentService.retryIndexing(id, req.userId!);
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
    const classified = classifyRetryError(message);
    jsonError(res, req, classified.status, classified.message);
  }
}
