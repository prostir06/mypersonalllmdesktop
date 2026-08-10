/**
 * Embedding orchestration: provider selection + pgvector / fallback retrieval.
 */
import prisma from '../config/prisma';
import logger from '../logger';
import {
  packRelevantChunks,
  type PackRagOptions,
} from '../utils/packRelevantChunks';
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

const EMBEDDING_COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;

let embeddingColumnCache: { value: boolean; checkedAt: number } | null = null;

async function hasEmbeddingColumn(): Promise<boolean> {
  const now = Date.now();
  if (
    embeddingColumnCache &&
    now - embeddingColumnCache.checkedAt < EMBEDDING_COLUMN_CACHE_TTL_MS
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

class EmbeddingService {
  static resetEmbeddingColumnCache(): void {
    embeddingColumnCache = null;
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
    embeddingProvider?: EmbeddingProviderName | null
  ): Promise<RelevantChunk[]> {
    try {
      const hasPgVector = await hasEmbeddingColumn();

      if (hasPgVector && queryEmbedding) {
        const vectorLiteral = `[${queryEmbedding.join(',')}]`;
        const params: unknown[] = [vectorLiteral, userId];
        let query = `
          SELECT dc.content, d.filename,
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

        const rows = (await prisma.$queryRawUnsafe(
          query,
          ...params
        )) as RelevantChunk[];

        const packed = packRelevantChunks(rows, packOptions).slice(0, limit);
        if (packed.length > 0) {
          logger.info(
            `EmbeddingService: Found ${packed.length} relevant chunks via vector search (${embeddingProvider || 'any'})`
          );
          return packed;
        }
      }

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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`EmbeddingService.findRelevantChunks error: ${message}`);
      return [];
    }
  }
}

export = EmbeddingService;
