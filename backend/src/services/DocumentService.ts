const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
import prisma from '../config/prisma';
import logger from '../logger';
import EmbeddingService = require('./EmbeddingService');
import {
  getMaxUploadBytes,
  resolveDocumentKind,
} from '../utils/fileMagic';
import { resolveOpenAiApiKey } from '../utils/openaiKeyResolver';
import { enqueueDocumentJob } from '../utils/documentJobQueue';

type FileInfo = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type DocumentRow = {
  id: number;
  userId: number;
  filename: string;
  fileType: string;
  fileSize: number;
  status?: string;
  createdAt: Date;
};

type EnqueueFn = (job: () => void | Promise<void>) => void;

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

async function writeTempUpload(buffer: Buffer): Promise<string> {
  await ensureUploadsDir();
  const tempPath = path.join(UPLOADS_DIR, `pending-${randomUUID()}`);
  await fs.writeFile(tempPath, buffer);
  return tempPath;
}

async function deleteTempUpload(tempPath: string | null): Promise<void> {
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

type FileMeta = Pick<FileInfo, 'originalname' | 'mimetype' | 'size'>;
type UploadSource = Buffer | string;

function defaultEnqueue(job: () => void | Promise<void>): void {
  enqueueDocumentJob(job);
}

function toPublicDocument(row: DocumentRow, chunksCount?: number) {
  const base = {
    id: row.id,
    user_id: row.userId,
    filename: row.filename,
    file_type: row.fileType,
    file_size: row.fileSize,
    status: row.status || 'ready',
    created_at: row.createdAt,
  };

  if (chunksCount !== undefined) {
    return { ...base, chunks_count: chunksCount };
  }

  return base;
}

class DocumentService {
  static chunkText(text: string, chunkSize = 1500, overlap = 300): string[] {
    if (!text || typeof text !== 'string') return [];

    const cleaned = text.replace(/\r\n/g, '\n').trim();
    if (cleaned.length <= chunkSize) return [cleaned];

    const chunks: string[] = [];
    let start = 0;

    while (start < cleaned.length) {
      let end = start + chunkSize;

      if (end < cleaned.length) {
        const lastBreak = cleaned.lastIndexOf('\n\n', end);
        if (lastBreak > start + chunkSize / 2) {
          end = lastBreak;
        } else {
          const lastSentence = cleaned.lastIndexOf('. ', end);
          if (lastSentence > start + chunkSize / 2) {
            end = lastSentence + 1;
          }
        }
      }

      const chunk = cleaned.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      start = end - overlap;
    }

    return chunks;
  }

  static async extractText(
    buffer: Buffer,
    mimetype: string,
    originalname: string
  ): Promise<string> {
    const kind = resolveDocumentKind(buffer, mimetype, originalname);

    if (kind === 'pdf') {
      const parser = new PDFParse({ data: buffer });
      try {
        const pdfData = await parser.getText();
        return pdfData?.text || '';
      } finally {
        await parser.destroy();
      }
    }

    if (kind === 'docx') {
      const docxResult = await mammoth.extractRawText({ buffer });
      return docxResult.value;
    }

    return buffer.toString('utf-8');
  }

  static assertWithinSizeLimit(fileInfo: FileInfo): void {
    const { size, buffer } = fileInfo;
    const maxBytes = getMaxUploadBytes();
    if (size > maxBytes || buffer.length > maxBytes) {
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
    const { originalname, mimetype, size, buffer } = fileInfo;
    const tempPath = await writeTempUpload(buffer);

    const doc = await prisma.document.create({
      data: {
        userId,
        filename: originalname,
        fileType: mimetype,
        fileSize: size,
        status: 'pending',
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
    const { originalname, mimetype } = meta;
    const tempPath = typeof source === 'string' ? source : null;

    try {
      const buffer =
        typeof source === 'string' ? await fs.readFile(source) : source;
      const extractedText = await this.extractText(buffer, mimetype, originalname);

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('Не вдалося витягти текст з надісланого файлу');
      }

      const chunks = this.chunkText(extractedText);
      let embeddings: Array<number[] | null> = [];
      const openaiKey = await resolveOpenAiApiKey(userId);

      if (EmbeddingService.isAvailable(openaiKey)) {
        embeddings = await EmbeddingService.generateBatchEmbeddings(
          chunks,
          openaiKey
        );
      }

      const hasAnyEmbedding = embeddings.some(Boolean);

      const doc = await prisma.$transaction(async (tx) => {
        if (!hasAnyEmbedding) {
          await tx.documentChunk.createMany({
            data: chunks.map((content, chunkIndex) => ({
              documentId: docId,
              chunkIndex,
              content,
            })),
          });
        } else {
          const values: string[] = [];
          const params: unknown[] = [];
          let p = 1;
          for (let i = 0; i < chunks.length; i++) {
            const embedding = embeddings[i] || null;
            if (embedding) {
              values.push(`($${p++}, $${p++}, $${p++}, $${p++}::vector)`);
              params.push(docId, i, chunks[i], `[${embedding.join(',')}]`);
            } else {
              values.push(`($${p++}, $${p++}, $${p++}, NULL)`);
              params.push(docId, i, chunks[i]);
            }
          }
          await tx.$executeRawUnsafe(
            `INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
             VALUES ${values.join(', ')}`,
            ...params
          );
        }

        return tx.document.update({
          where: { id: docId },
          data: { status: 'ready' },
        });
      });

      logger.info(
        `Document uploaded & chunked: ${originalname} (id=${docId}, ${chunks.length} chunks, embeddings=${embeddings.filter(Boolean).length})`
      );

      if (!EmbeddingService.isAvailable(openaiKey)) {
        logger.warn(
          'Embeddings not generated: OPENAI_API_KEY not configured. RAG will use fallback chunk selection.'
        );
      }

      return {
        document: toPublicDocument(doc),
        chunksCount: chunks.length,
      };
    } catch (error: unknown) {
      await prisma.document.update({
        where: { id: docId },
        data: { status: 'failed' },
      });
      throw error;
    } finally {
      await deleteTempUpload(tempPath);
    }
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

    return this.finalizeUpload(
      doc.id,
      userId,
      { originalname, mimetype, size },
      fileInfo.buffer
    );
  }

  static async getByUser(userId: number, limit = 50, offset = 0) {
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
      items: rows.map((row) => toPublicDocument(row, row._count.chunks)),
      total,
      limit,
      offset,
    };
  }

  static async getById(docId: number, userId: number) {
    const row = await prisma.document.findFirst({
      where: { id: docId, userId },
      include: { _count: { select: { chunks: true } } },
    });
    if (!row) return null;
    return toPublicDocument(row, row._count.chunks);
  }

  static async delete(docId: number, userId: number): Promise<boolean> {
    const result = await prisma.document.deleteMany({
      where: { id: docId, userId },
    });

    return result.count > 0;
  }
}

export = DocumentService;
