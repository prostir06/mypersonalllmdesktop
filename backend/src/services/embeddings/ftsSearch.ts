import prisma from '../../config/prisma';
import { hasContentTsvColumn } from './schemaColumns';
import type { FtsRow } from './retrieveTypes';

export async function queryFtsRows(
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
