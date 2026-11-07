const fs = require('fs/promises');
import prisma from '../../config/prisma';
import logger from '../../logger';
import EmbeddingService from '../EmbeddingService';
import { resolveEmbeddingContext } from '../embeddings/resolveEmbeddingContext';
import { chunkText } from './chunking';
import { toPublicDocument } from './publicDocument';
import { truncateFailureReason } from './status';
import { deleteTempUpload } from './tempUploads';
import { extractTextOffThread } from './extractOffThread';
import { DocumentQueueFullError } from '../../utils/documentJobQueue';

export type FileMeta = {
  originalname: string;
  mimetype: string;
  size: number;
};

export type UploadSource = Buffer | string;

export type EnqueueFn = (job: () => void | Promise<void>) => boolean | void;

const CHUNK_WRITE_BATCH = 1000;

type ChunkWriter = {
  documentChunk: {
    createMany: (args: {
      data: Array<{ documentId: number; chunkIndex: number; content: string }>;
    }) => Promise<unknown>;
  };
  $executeRawUnsafe: (sql: string, ...params: unknown[]) => Promise<unknown>;
};

async function insertChunks(
  tx: ChunkWriter,
  docId: number,
  chunks: string[],
  embeddings: Array<number[] | null>,
  hasAnyEmbedding: boolean
): Promise<void> {
  for (let start = 0; start < chunks.length; start += CHUNK_WRITE_BATCH) {
    const end = Math.min(chunks.length, start + CHUNK_WRITE_BATCH);
    if (!hasAnyEmbedding) {
      await tx.documentChunk.createMany({
        data: chunks.slice(start, end).map((content, offset) => ({
          documentId: docId,
          chunkIndex: start + offset,
          content,
        })),
      });
      continue;
    }

    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (let i = start; i < end; i++) {
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
}

/** Parse, chunk, embed an already-created pending document. */
export async function finalizeUpload(
  docId: number,
  userId: number,
  meta: FileMeta,
  source: UploadSource
) {
  const { originalname, mimetype } = meta;
  const tempPath = typeof source === 'string' ? source : null;
  let succeeded = false;

  try {
    const buffer =
      typeof source === 'string' ? await fs.readFile(source) : source;
    const extractedText = await extractTextOffThread(buffer, mimetype, originalname);

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('Не вдалося витягти текст з надісланого файлу');
    }

    const chunks = chunkText(extractedText);
    const embedCtx = await resolveEmbeddingContext(userId);
    let embeddings: Array<number[] | null> = [];

    if (EmbeddingService.isAvailable(embedCtx)) {
      embeddings = await EmbeddingService.generateBatchEmbeddings(
        chunks,
        embedCtx
      );
    }

    const embeddingCount = embeddings.filter(Boolean).length;
    const hasAnyEmbedding = embeddingCount > 0;
    const embeddingProvider =
      hasAnyEmbedding && embedCtx.provider !== 'none'
        ? embedCtx.provider
        : null;

    const doc = await prisma.$transaction(async (tx) => {
      await insertChunks(tx, docId, chunks, embeddings, hasAnyEmbedding);

      return tx.document.update({
        where: { id: docId },
        data: {
          status: 'ready',
          failureReason: null,
          stagingPath: null,
          embeddingsCount: embeddingCount,
          embeddingProvider,
        },
      });
    });

    succeeded = true;

    logger.info(
      `Document uploaded & chunked: ${originalname} (id=${docId}, ${chunks.length} chunks, embeddings=${embeddingCount}, provider=${embeddingProvider || 'none'})`
    );

    if (!EmbeddingService.isAvailable(embedCtx)) {
      logger.warn(
        'Embeddings not generated: no OpenAI key and Ollama provider not configured. RAG will use fallback chunk selection.'
      );
    }

    return {
      document: toPublicDocument(doc, chunks.length, embedCtx),
      chunksCount: chunks.length,
      embeddingsCount: embeddingCount,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Mark failed for UI/retry; never let this secondary write hide the original error.
    try {
      await prisma.document.update({
        where: { id: docId },
        data: {
          status: 'failed',
          failureReason: truncateFailureReason(message),
        },
      });
    } catch (markErr: unknown) {
      const markMsg =
        markErr instanceof Error ? markErr.message : String(markErr);
      logger.error(
        `finalizeUpload: failed to mark document ${docId} as failed: ${markMsg}`
      );
    }
    throw error;
  } finally {
    if (succeeded && tempPath) {
      await deleteTempUpload(tempPath);
    }
  }
}

/** Re-queue indexing for a failed document when staging file still exists. */
export async function retryIndexing(
  docId: number,
  userId: number,
  enqueue: EnqueueFn
) {
  const doc = await prisma.document.findFirst({
    where: { id: docId, userId, status: 'failed' },
  });
  if (!doc) return null;

  if (!doc.stagingPath) {
    throw new Error(
      'Файл недоступний для повторної індексації — завантажте документ знову'
    );
  }

  try {
    await fs.access(doc.stagingPath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `retryIndexing: staging file missing for ${doc.filename}: ${message}`
    );
    throw new Error(
      'Файл недоступний для повторної індексації — завантажте документ знову',
      { cause: err }
    );
  }

  const updated = await prisma.document.update({
    where: { id: docId },
    data: { status: 'pending', failureReason: null, createdAt: new Date() },
  });

  const meta = {
    originalname: doc.filename,
    mimetype: doc.fileType,
    size: doc.fileSize,
  };

  const queued = enqueue(async () => {
    try {
      await finalizeUpload(docId, userId, meta, doc.stagingPath!);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Background document retry failed id=${docId}: ${message}`);
    }
  });
  if (queued === false) {
    await prisma.document.update({
      where: { id: docId },
      data: {
        status: 'failed',
        failureReason: truncateFailureReason('Черга індексації переповнена'),
      },
    });
    throw new DocumentQueueFullError();
  }

  return { document: toPublicDocument(updated) };
}

/** Re-embed existing chunks (e.g. after enabling Ollama embeddings). */
export async function reindexEmbeddings(docId: number, userId: number) {
  const doc = await prisma.document.findFirst({
    where: { id: docId, userId, status: 'ready' },
  });
  if (!doc) return null;

  const embedCtx = await resolveEmbeddingContext(userId);
  if (!EmbeddingService.isAvailable(embedCtx)) {
    throw new Error('Немає доступного провайдера embeddings');
  }

  const chunks = await prisma.documentChunk.findMany({
    where: { documentId: docId },
    orderBy: { chunkIndex: 'asc' },
    select: { id: true, content: true },
  });

  if (chunks.length === 0) {
    throw new Error('Документ не містить фрагментів для переіндексації');
  }

  const texts = chunks.map((c) => c.content);
  const embeddings = await EmbeddingService.generateBatchEmbeddings(
    texts,
    embedCtx
  );
  const embeddingCount = embeddings.filter(Boolean).length;

  if (embeddingCount === 0) {
    if (embedCtx.provider === 'openai') {
      throw new Error(
        'Не вдалося згенерувати embeddings через OpenAI. Перевірте дійсність вашого OpenAI API ключа в налаштуваннях.'
      );
    }
    throw new Error(
      'Не вдалося згенерувати embeddings. Переконайтеся, що Ollama запущено та модель nomic-embed-text завантажена.'
    );
  }

  const embeddingProvider =
    embedCtx.provider !== 'none' ? embedCtx.provider : null;

  await prisma.$transaction(async (tx) => {
    // Batch UPDATE via VALUES list instead of N individual queries.
    const withEmbedding: { id: number; vec: string }[] = [];
    const withoutEmbedding: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const emb = embeddings[i];
      if (emb) {
        withEmbedding.push({ id: chunks[i].id, vec: `[${emb.join(',')}]` });
      } else {
        withoutEmbedding.push(chunks[i].id);
      }
    }

    if (withEmbedding.length > 0) {
      const values = withEmbedding
        .map((_, idx) => `($${idx * 2 + 1}::int, $${idx * 2 + 2}::vector)`)
        .join(', ');
      const params = withEmbedding.flatMap((e) => [e.id, e.vec]);
      await tx.$executeRawUnsafe(
        `UPDATE document_chunks AS dc SET embedding = v.emb
         FROM (VALUES ${values}) AS v(cid, emb)
         WHERE dc.id = v.cid`,
        ...params
      );
    }

    if (withoutEmbedding.length > 0) {
      await tx.$executeRawUnsafe(
        `UPDATE document_chunks SET embedding = NULL WHERE id = ANY($1::int[])`,
        withoutEmbedding
      );
    }

    await tx.document.update({
      where: { id: docId },
      data: { embeddingsCount: embeddingCount, embeddingProvider },
    });
  });

  const updated = await prisma.document.findFirst({
    where: { id: docId },
    include: { _count: { select: { chunks: true } } },
  });

  return {
    document: toPublicDocument(updated!, updated!._count.chunks, embedCtx),
    embeddingsCount: embeddingCount,
  };
}
