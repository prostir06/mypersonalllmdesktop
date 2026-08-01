import axios from 'axios';
import prisma from '../config/prisma';
import logger from '../logger';

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

type RelevantChunk = {
  content: string;
  filename: string;
  similarity: number;
};

class EmbeddingService {
  static isAvailable(): boolean {
    return Boolean(
      process.env.OPENAI_API_KEY &&
        process.env.OPENAI_API_KEY !== 'your_openai_api_key_here'
    );
  }

  static async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.isAvailable()) {
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
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
    texts: string[]
  ): Promise<(number[] | null)[]> {
    if (!this.isAvailable()) {
      logger.warn(
        'EmbeddingService: OPENAI_API_KEY not configured. Skipping batch embedding.'
      );
      return texts.map(() => null);
    }

    try {
      const cleanTexts = texts.map((t) => {
        const clean = t.replace(/\n/g, ' ').trim();
        return clean.length > 6000 ? clean.substring(0, 6000) : clean;
      });

      const response = await axios.post(
        OPENAI_EMBEDDING_URL,
        {
          model: EMBEDDING_MODEL,
          input: cleanTexts,
          dimensions: EMBEDDING_DIMENSIONS,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      const embeddings: (number[] | null)[] = new Array(texts.length).fill(null);
      for (const item of response.data.data as Array<{
        index: number;
        embedding: number[];
      }>) {
        embeddings[item.index] = item.embedding;
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
    limit = 5
  ): Promise<RelevantChunk[]> {
    try {
      const columnCheck = (await prisma.$queryRawUnsafe(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'document_chunks' AND column_name = 'embedding'
         LIMIT 1`
      )) as unknown[];

      const hasPgVector = columnCheck.length > 0;

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
        `;

        if (documentIds.length > 0) {
          params.push(documentIds);
          query += ` AND d.id = ANY($${params.length}::int[])`;
        }

        params.push(limit);
        query += ` ORDER BY dc.embedding <=> $1::vector LIMIT $${params.length}`;

        const rows = (await prisma.$queryRawUnsafe(
          query,
          ...params
        )) as RelevantChunk[];

        if (rows.length > 0) {
          logger.info(
            `EmbeddingService: Found ${rows.length} relevant chunks via vector search`
          );
          return rows;
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
      `;

      if (documentIds.length > 0) {
        fallbackParams.push(documentIds);
        fallbackQuery += ` AND d.id = ANY($${fallbackParams.length}::int[])`;
      }

      fallbackParams.push(limit * 2);
      fallbackQuery += ` ORDER BY dc.id ASC LIMIT $${fallbackParams.length}`;

      return (await prisma.$queryRawUnsafe(
        fallbackQuery,
        ...fallbackParams
      )) as RelevantChunk[];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`EmbeddingService.findRelevantChunks error: ${message}`);
      return [];
    }
  }
}

export = EmbeddingService;
