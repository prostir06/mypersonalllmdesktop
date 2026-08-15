import type { EmbeddingContext, EmbeddingProviderName } from '../embeddings/types';

export type DocumentRow = {
  id: number;
  userId: number;
  filename: string;
  fileType: string;
  fileSize: number;
  status?: string;
  failureReason?: string | null;
  embeddingsCount?: number;
  embeddingProvider?: string | null;
  createdAt: Date;
};

export function computeNeedsReindex(
  row: DocumentRow,
  currentProvider: EmbeddingProviderName
): boolean {
  const count = row.embeddingsCount ?? 0;
  if (currentProvider === 'none') return count === 0;
  if (count === 0) return true;
  return row.embeddingProvider !== currentProvider;
}

export function toPublicDocument(
  row: DocumentRow,
  chunksCount?: number,
  embedCtx?: EmbeddingContext
) {
  const embeddingsCount = row.embeddingsCount ?? 0;
  const base = {
    id: row.id,
    user_id: row.userId,
    filename: row.filename,
    file_type: row.fileType,
    file_size: row.fileSize,
    status: row.status || 'ready',
    failure_reason: row.failureReason ?? undefined,
    has_embeddings: embeddingsCount > 0,
    embeddings_count: embeddingsCount,
    embedding_provider: row.embeddingProvider ?? null,
    needs_reindex: embedCtx
      ? computeNeedsReindex(row, embedCtx.provider)
      : undefined,
    created_at: row.createdAt,
  };

  if (chunksCount !== undefined) {
    return { ...base, chunks_count: chunksCount };
  }

  return base;
}
