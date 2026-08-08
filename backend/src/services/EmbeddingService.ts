/**
 * OpenAI embeddings + pgvector / fallback chunk retrieval for RAG.
 * findRelevantChunks never takes a pg Pool — all SQL goes through Prisma.
 */
import axios from 'axios';
import prisma from '../config/prisma';
import logger from '../logger';
import {
  packRelevantChunks,
  type PackRagOptions,
} from '../utils/packRelevantChunks';

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
/** OpenAI allows up to 2048 inputs; keep batches smaller for token/latency safety. */
const EMBEDDING_BATCH_SIZE = 100;

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
  /** Test helper — clear process-local schema probe cache. */
  static resetEmbeddingColumnCache(): void {
    embeddingColumnCache = null;
  }

  static resolveKey(apiKey?: string | null): string | null {
    if (apiKey && apiKey !== 'your_openai_api_key_here') return apiKey;
    if (
      process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY !== 'your_openai_api_key_here'
    ) {
      return process.env.OPENAI_API_KEY;
    }
    return null;
  }

  static isAvailable(apiKey?: string | null): boolean {
    return Boolean(this.resolveKey(apiKey));
  }

  static async generateEmbedding(
    text: string,
    apiKey?: string | null
  ): Promise<number[] | null> {
    const key = this.resolveKey(apiKey);
    if (!key) {
      logger.warn(
        'EmbeddingService: OPENAI_API_KEY not configured. Skipping embedding generation.'
      );
      return null;
    }

    try {
      const cleanText = text.replace(/\n/g, ' ').trim();
      const truncated =
        cleanText.length > 6000 ? cleanText.substring(0, 6000) : cleanText;

      const response = await axios.post(
        OPENAI_EMBEDDING_URL,
        {
          model: EMBEDDING_MODEL,
          input: truncated,
          dimensions: EMBEDDING_DIMENSIONS,
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      return response.data.data[0].embedding as number[];
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      };
      logger.error(
        `EmbeddingService.generateEmbedding error: ${
          err.response?.data?.error?.message || err.message
        }`
      );
      return null;
    }
  }

  static async generateBatchEmbeddings(
    texts: string[],
    apiKey?: string | null
  ): Promise<(number[] | null)[]> {
    const key = this.resolveKey(apiKey);
    if (!key) {
      logger.warn(
        'EmbeddingService: OPENAI_API_KEY not configured. Skipping batch embedding.'
      );
      return texts.map(() => null);
    }

    if (texts.length === 0) return [];

    const cleanTexts = texts.map((t) => {
      const clean = t.replace(/\n/g, ' ').trim();
      return clean.length > 6000 ? clean.substring(0, 6000) : clean;
    });

    const embeddings: (number[] | null)[] = new Array(texts.length).fill(null);

    try {
      for (let offset = 0; offset < cleanTexts.length; offset += EMBEDDING_BATCH_SIZE) {
        const batch = cleanTexts.slice(offset, offset + EMBEDDING_BATCH_SIZE);
        const response = await axios.post(
          OPENAI_EMBEDDING_URL,
          {
            model: EMBEDDING_MODEL,
            input: batch,
            dimensions: EMBEDDING_DIMENSIONS,
          },
          {
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000,
          }
        );

        for (const item of response.data.data as Array<{
          index: number;
          embedding: number[];
        }>) {
          embeddings[offset + item.index] = item.embedding;
        }
      }

      logger.info(
        `EmbeddingService: Generated ${embeddings.filter(Boolean).length}/${texts.length} embeddings`
      );
      return embeddings;
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      };
      logger.error(
        `EmbeddingService.generateBatchEmbeddings error: ${
          err.response?.data?.error?.message || err.message
        }`
      );
      return texts.map(() => null);
    }
  }

  static async findRelevantChunks(
    queryEmbedding: number[] | null,
    userId: number,
    documentIds: number[] = [],
    limit = 5,
    packOptions: PackRagOptions = {}
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

        if (documentIds.length > 0) {
          params.push(documentIds);
          query += ` AND d.id = ANY($${params.length}::int[])`;
        }

        // Fetch extra candidates so similarity/budget packing still has room.
        params.push(Math.max(limit * 3, limit));
        query += ` ORDER BY dc.embedding <=> $1::vector LIMIT $${params.length}`;

        const rows = (await prisma.$queryRawUnsafe(
          query,
          ...params
        )) as RelevantChunk[];

        const packed = packRelevantChunks(rows, packOptions).slice(0, limit);
        if (packed.length > 0) {
          logger.info(
            `EmbeddingService: Found ${packed.length} relevant chunks via vector search`
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
