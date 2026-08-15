import prisma from '../config/prisma';
import logger from '../logger';
import { resolveEmbeddingContext } from './embeddings/resolveEmbeddingContext';
import { getMaxUploadBytes } from '../utils/fileMagic';
import { enqueueDocumentJob } from '../utils/documentJobQueue';
import { chunkText as chunkTextImpl } from './documents/chunking';
import { extractText as extractTextImpl } from './documents/extraction';
import {
  finalizeUpload as finalizeUploadImpl,
  reindexEmbeddings as reindexEmbeddingsImpl,
  retryIndexing as retryIndexingImpl,
  type FileMeta,
  type UploadSource,
} from './documents/indexing';
import { toPublicDocument } from './documents/publicDocument';
import { deleteTempUpload, writeTempUpload } from './documents/tempUploads';

type FileInfo = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  path?: string;
};

type EnqueueFn = (job: () => void | Promise<void>) => void;

function defaultEnqueue(job: () => void | Promise<void>): void {
  enqueueDocumentJob(job);
}

class DocumentService {
  static chunkText(text: string, chunkSize = 1500, overlap = 300): string[] {
    return chunkTextImpl(text, chunkSize, overlap);
  }

  static async extractText(
    buffer: Buffer,
    mimetype: string,
    originalname: string
  ): Promise<string> {
    return extractTextImpl(buffer, mimetype, originalname);
  }

  static assertWithinSizeLimit(fileInfo: FileInfo): void {
    const { size } = fileInfo;
    const maxBytes = getMaxUploadBytes();
    if (size > maxBytes) {
      throw new Error(`Файл перевищує ліміт розміру (${maxBytes} байт)`);
    }
  }

  /** Accept upload immediately; process parse/embed in background. */
  static async acceptUpload(
    fileInfo: FileInfo,
    userId: number,
    enqueue: EnqueueFn = defaultEnqueue
  ) {
    this.assertWithinSizeLimit(fileInfo);
    const { originalname, mimetype, size, buffer, path: diskPath } = fileInfo;
    const tempPath = diskPath ?? await writeTempUpload(buffer!);

    const doc = await prisma.document.create({
      data: {
        userId,
        filename: originalname,
        fileType: mimetype,
        fileSize: size,
        status: 'pending',
        stagingPath: tempPath,
      },
    });

    enqueue(async () => {
      try {
        await this.finalizeUpload(
          doc.id,
          userId,
          { originalname, mimetype, size },
          tempPath
        );
      } catch (error: unknown) {
        // Fire-and-forget: finalizeUpload already marks status=failed before rethrow.
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Background document processing failed id=${doc.id}: ${message}`);
      }
    });

    return { document: toPublicDocument(doc) };
  }

  /** Parse, chunk, embed an already-created pending document. */
  static async finalizeUpload(
    docId: number,
    userId: number,
    meta: FileMeta,
    source: UploadSource
  ) {
    return finalizeUploadImpl(docId, userId, meta, source);
  }

  /** Re-queue indexing for a failed document when staging file still exists. */
  static async retryIndexing(
    docId: number,
    userId: number,
    enqueue: EnqueueFn = defaultEnqueue
  ) {
    return retryIndexingImpl(docId, userId, enqueue);
  }

  /** Re-embed existing chunks (e.g. after enabling Ollama embeddings). */
  static async reindexEmbeddings(docId: number, userId: number) {
    return reindexEmbeddingsImpl(docId, userId);
  }

  static async getChunks(
    docId: number,
    userId: number,
    limit = 5,
    offset = 0
  ) {
    const doc = await prisma.document.findFirst({
      where: { id: docId, userId },
      select: { id: true },
    });
    if (!doc) return null;

    const where = { documentId: docId };
    const [rows, total] = await Promise.all([
      prisma.documentChunk.findMany({
        where,
        orderBy: { chunkIndex: 'asc' },
        take: limit,
        skip: offset,
        select: { chunkIndex: true, content: true },
      }),
      prisma.documentChunk.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        chunk_index: row.chunkIndex,
        content: row.content,
      })),
      total,
      limit,
      offset,
    };
  }

  /** Sync helper (tests / legacy): accept then await finalize. */
  static async uploadAndProcess(fileInfo: FileInfo, userId: number) {
    this.assertWithinSizeLimit(fileInfo);
    const { originalname, mimetype, size } = fileInfo;

    const doc = await prisma.document.create({
      data: {
        userId,
        filename: originalname,
        fileType: mimetype,
        fileSize: size,
        status: 'pending',
      },
    });

    const source: UploadSource = fileInfo.path ?? fileInfo.buffer!;
    return this.finalizeUpload(
      doc.id,
      userId,
      { originalname, mimetype, size },
      source
    );
  }

  static async getByUser(userId: number, limit = 50, offset = 0) {
    const embedCtx = await resolveEmbeddingContext(userId);
    const where = { userId };
    const [rows, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { _count: { select: { chunks: true } } },
      }),
      prisma.document.count({ where }),
    ]);

    return {
      items: rows.map((row) => toPublicDocument(row, row._count.chunks, embedCtx)),
      total,
      limit,
      offset,
    };
  }

  static async getById(docId: number, userId: number) {
    const embedCtx = await resolveEmbeddingContext(userId);
    const row = await prisma.document.findFirst({
      where: { id: docId, userId },
      include: { _count: { select: { chunks: true } } },
    });
    if (!row) return null;
    return toPublicDocument(row, row._count.chunks, embedCtx);
  }

  static async delete(docId: number, userId: number): Promise<boolean> {
    const row = await prisma.document.findFirst({
      where: { id: docId, userId },
      select: { stagingPath: true },
    });
    if (!row) return false;

    const result = await prisma.document.deleteMany({
      where: { id: docId, userId },
    });

    if (result.count > 0 && row.stagingPath) {
      await deleteTempUpload(row.stagingPath);
    }

    return result.count > 0;
  }
}

export = DocumentService;
