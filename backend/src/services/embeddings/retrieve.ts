import prisma from '../../config/prisma';
import logger from '../../logger';
import {
  packRelevantChunks,
  type PackRagOptions,
} from '../../utils/packRelevantChunks';
import { hybridFuse, normalizeFtsRanks } from './hybridFusion';
import { queryFtsRows } from './ftsSearch';
import { hasEmbeddingColumn } from './schemaColumns';
import { queryVectorRows } from './vectorSearch';
import type { EmbeddingProviderName } from './types';
import type { FtsRow, RelevantChunk, VectorRow } from './retrieveTypes';

function packFtsRows(
  ftsRows: FtsRow[],
  packOptions: PackRagOptions,
  limit: number
): RelevantChunk[] {
  return packRelevantChunks(
    normalizeFtsRanks(ftsRows).map((r) => ({
      content: r.content,
      filename: r.filename,
      similarity: r.rank || 0.5,
    })),
    { minSimilarity: 0, maxChars: packOptions.maxChars }
  ).slice(0, limit);
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

export async function findRelevantChunks(
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
      const packed = packFtsRows(ftsRows, packOptions, limit);
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
      const packed = packFtsRows(ftsRows, packOptions, limit);
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
    const requestId = packOptions.requestId || '-';
    const ids = documentIds.length > 0 ? documentIds.join(',') : '-';
    logger.error(
      `EmbeddingService.findRelevantChunks error: ${message} requestId=${requestId} userId=${userId} documentIds=${ids}`
    );
    throw error instanceof Error ? error : new Error(message);
  }
}
