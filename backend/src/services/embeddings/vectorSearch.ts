import prisma from '../../config/prisma';
import type { EmbeddingProviderName } from './types';
import type { VectorRow } from './retrieveTypes';

export async function queryVectorRows(
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

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL hnsw.iterative_scan = relaxed_order');
    return (await tx.$queryRawUnsafe(query, ...params)) as VectorRow[];
  });
}
