/**
 * Embedding orchestration: provider selection + pgvector / hybrid / fallback retrieval.
 */
import prisma from '../config/prisma';
import logger from '../logger';
import {
  packRelevantChunks,
  type PackRagOptions,
} from '../utils/packRelevantChunks';
import { hybridFuse } from './embeddings/hybridFusion';
import { OpenAiEmbeddingProvider } from './embeddings/OpenAiEmbeddingProvider';
import { OllamaEmbeddingProvider } from './embeddings/OllamaEmbeddingProvider';
import type {
  EmbeddingContext,
  EmbeddingProviderName,
} from './embeddings/types';

type RelevantChunk = {
  content: string;
  filename: string;
  similarity: number;
};

type VectorRow = {
  chunk_id: number;
  content: string;
  filename: string;
  similarity: number;
};

type FtsRow = {
  chunk_id: number;
  content: string;
  filename: string;
  rank: number;
};

const COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;

let embeddingColumnCache: { value: boolean; checkedAt: number } | null = null;
let contentTsvColumnCache: { value: boolean; checkedAt: number } | null = null;

async function hasEmbeddingColumn(): Promise<boolean> {
  const now = Date.now();
  if (
    embeddingColumnCache &&
    now - embeddingColumnCache.checkedAt < COLUMN_CACHE_TTL_MS
  ) {
    return embeddingColumnCache.value;
  }

  const columnCheck = (await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'document_chunks' AND column_name = 'embedding'
     LIMIT 1`
  )) as unknown[];

  embeddingColumnCache = {
    value: columnCheck.length > 0,
    checkedAt: now,
  };
  return embeddingColumnCache.value;
}

async function hasContentTsvColumn(): Promise<boolean> {
  const now = Date.now();
  if (
    contentTsvColumnCache &&
    now - contentTsvColumnCache.checkedAt < COLUMN_CACHE_TTL_MS
  ) {
    return contentTsvColumnCache.value;
  }

  const columnCheck = (await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'document_chunks' AND column_name = 'content_tsv'
     LIMIT 1`
  )) as unknown[];

  contentTsvColumnCache = {
    value: columnCheck.length > 0,
    checkedAt: now,
  };
  return contentTsvColumnCache.value;
}

async function queryVectorRows(
  queryEmbedding: number[],
  userId: number,
  documentIds: number[],
  limit: number,
  embeddingProvider?: EmbeddingProviderName | null
): Promise<VectorRow[]> {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;
  const params: unknown[] = [vectorLiteral, userId];
  let query = `
    SELECT dc.id AS chunk_id, dc.content, d.filename,
           1 - (dc.embedding <=> $1::vector) AS similarity
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE d.user_id = $2
      AND dc.embedding IS NOT NULL
      AND d.status = 'ready'
  `;

  if (embeddingProvider && embeddingProvider !== 'none') {
    params.push(embeddingProvider);
    query += ` AND d.embedding_provider = $${params.length}`;
  }

  if (documentIds.length > 0) {
    params.push(documentIds);
    query += ` AND d.id = ANY($${params.length}::int[])`;
  }

  params.push(Math.max(limit * 3, limit));
  query += ` ORDER BY dc.embedding <=> $1::vector LIMIT $${params.length}`;

  return (await prisma.$queryRawUnsafe(query, ...params)) as VectorRow[];
}

async function queryFtsRows(
  queryText: string,
  userId: number,
  documentIds: number[],
  limit: number
): Promise<FtsRow[]> {
  const hasTsv = await hasContentTsvColumn();
  const matchClause = hasTsv
    ? `dc.content_tsv @@ plainto_tsquery('simple', $1)`
    : `to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', $1)`;
  const rankExpr = hasTsv
    ? `ts_rank_cd(dc.content_tsv, plainto_tsquery('simple', $1))`
    : `ts_rank_cd(to_tsvector('simple', dc.content), plainto_tsquery('simple', $1))`;

  const params: unknown[] = [queryText, userId];
  let query = `
    SELECT dc.id AS chunk_id, dc.content, d.filename,
           ${rankExpr} AS rank
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE d.user_id = $2
      AND d.status = 'ready'
      AND ${matchClause}
  `;

  if (documentIds.length > 0) {
    params.push(documentIds);
    query += ` AND d.id = ANY($${params.length}::int[])`;
  }

  params.push(Math.max(limit * 3, limit));
  query += ` ORDER BY rank DESC LIMIT $${params.length}`;

  return (await prisma.$queryRawUnsafe(query, ...params)) as FtsRow[];
}

async function queryRecencyFallback(
  userId: number,
  documentIds: number[],
  limit: number,
  packOptions: PackRagOptions
): Promise<RelevantChunk[]> {
  logger.info(
    'EmbeddingService: Using fallback chunk selection (no pgvector or no embeddings)'
  );
  const fallbackParams: unknown[] = [userId];
  let fallbackQuery = `
    SELECT dc.content, d.filename, 1.0 AS similarity
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE d.user_id = $1
      AND d.status = 'ready'
  `;

  if (documentIds.length > 0) {
    fallbackParams.push(documentIds);
    fallbackQuery += ` AND d.id = ANY($${fallbackParams.length}::int[])`;
  }

  fallbackParams.push(limit * 2);
  fallbackQuery += ` ORDER BY d.created_at DESC, dc.chunk_index ASC, dc.id ASC LIMIT $${fallbackParams.length}`;

  const fallbackRows = (await prisma.$queryRawUnsafe(
    fallbackQuery,
    ...fallbackParams
  )) as RelevantChunk[];

  return packRelevantChunks(fallbackRows, {
    minSimilarity: 0,
    maxChars: packOptions.maxChars,
  }).slice(0, limit);
}

class EmbeddingService {
  static resetEmbeddingColumnCache(): void {
    embeddingColumnCache = null;
    contentTsvColumnCache = null;
  }

  static isAvailable(ctx: EmbeddingContext): boolean {
    if (ctx.provider === 'openai') return Boolean(ctx.openaiKey);
    if (ctx.provider === 'ollama') return Boolean(ctx.ollamaHost);
    return false;
  }

  static async generateEmbedding(
    text: string,
    ctx: EmbeddingContext
  ): Promise<number[] | null> {
    if (ctx.provider === 'openai' && ctx.openaiKey) {
      return OpenAiEmbeddingProvider.generateEmbedding(text, ctx.openaiKey);
    }
    if (ctx.provider === 'ollama' && ctx.ollamaHost) {
      return OllamaEmbeddingProvider.generateEmbedding(text, ctx.ollamaHost);
    }
    logger.warn(
      'EmbeddingService: no embedding provider configured. Skipping embedding generation.'
    );
    return null;
  }

  static async generateBatchEmbeddings(
    texts: string[],
    ctx: EmbeddingContext
  ): Promise<(number[] | null)[]> {
    if (ctx.provider === 'openai' && ctx.openaiKey) {
      return OpenAiEmbeddingProvider.generateBatchEmbeddings(
        texts,
        ctx.openaiKey
      );
    }
    if (ctx.provider === 'ollama' && ctx.ollamaHost) {
      return OllamaEmbeddingProvider.generateBatchEmbeddings(
        texts,
        ctx.ollamaHost
      );
    }
    logger.warn(
      'EmbeddingService: no embedding provider configured. Skipping batch embedding.'
    );
    return texts.map(() => null);
  }

  static async findRelevantChunks(
    queryEmbedding: number[] | null,
    userId: number,
    documentIds: number[] = [],
    limit = 5,
    packOptions: PackRagOptions = {},
    embeddingProvider?: EmbeddingProviderName | null,
    queryText?: string
  ): Promise<RelevantChunk[]> {
    try {
      const trimmed = queryText?.trim() || '';
      const hasPgVector = await hasEmbeddingColumn();

      let vectorRows: VectorRow[] = [];
      if (hasPgVector && queryEmbedding) {
        vectorRows = await queryVectorRows(
          queryEmbedding,
          userId,
          documentIds,
          limit,
          embeddingProvider
        );
      }

      let ftsRows: FtsRow[] = [];
      if (trimmed) {
        ftsRows = await queryFtsRows(trimmed, userId, documentIds, limit);
      }

      if (trimmed && queryEmbedding && vectorRows.length > 0) {
        const fused = hybridFuse(
          vectorRows.map((r) => ({
            key: String(r.chunk_id),
            content: r.content,
            filename: r.filename,
            similarity: Number(r.similarity),
          })),
          ftsRows.map((r) => ({
            key: String(r.chunk_id),
            content: r.content,
            filename: r.filename,
            rank: Number(r.rank),
          }))
        );
        const packed = packRelevantChunks(
          fused.map((r) => ({
            content: r.content,
            filename: r.filename,
            similarity: r.score,
          })),
          packOptions
        ).slice(0, limit);
        if (packed.length > 0) {
          logger.info(
            `EmbeddingService: Found ${packed.length} relevant chunks via hybrid search (${embeddingProvider || 'any'})`
          );
          return packed;
        }
      }

      if (trimmed && ftsRows.length > 0 && !queryEmbedding) {
        const packed = packRelevantChunks(
          ftsRows.map((r) => ({
            content: r.content,
            filename: r.filename,
            similarity: Number(r.rank) || 0.5,
          })),
          { minSimilarity: 0, maxChars: packOptions.maxChars }
        ).slice(0, limit);
        if (packed.length > 0) {
          logger.info(
            `EmbeddingService: Found ${packed.length} relevant chunks via FTS`
          );
          return packed;
        }
      }

      if (!trimmed && vectorRows.length > 0) {
        const packed = packRelevantChunks(vectorRows, packOptions).slice(
          0,
          limit
        );
        if (packed.length > 0) {
          logger.info(
            `EmbeddingService: Found ${packed.length} relevant chunks via vector search (${embeddingProvider || 'any'})`
          );
          return packed;
        }
      }

      if (trimmed && ftsRows.length > 0) {
        const packed = packRelevantChunks(
          ftsRows.map((r) => ({
            content: r.content,
            filename: r.filename,
            similarity: Number(r.rank) || 0.5,
          })),
          { minSimilarity: 0, maxChars: packOptions.maxChars }
        ).slice(0, limit);
        if (packed.length > 0) {
          logger.info(
            `EmbeddingService: Found ${packed.length} relevant chunks via FTS (vector empty)`
          );
          return packed;
        }
      }

      return queryRecencyFallback(userId, documentIds, limit, packOptions);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`EmbeddingService.findRelevantChunks error: ${message}`);
      return [];
    }
  }
}

export = EmbeddingService;
