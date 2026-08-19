import prisma from '../../config/prisma';

const COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;

let embeddingColumnCache: { value: boolean; checkedAt: number } | null = null;
let contentTsvColumnCache: { value: boolean; checkedAt: number } | null = null;

export function resetEmbeddingColumnCache(): void {
  embeddingColumnCache = null;
  contentTsvColumnCache = null;
}

export async function hasEmbeddingColumn(): Promise<boolean> {
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

export async function hasContentTsvColumn(): Promise<boolean> {
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
