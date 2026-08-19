/**
 * Filter and pack RAG chunks by similarity threshold and character budget
 * (cheap proxy for token budget before stuffing the system prompt).
 */
export type RagChunk = {
  content: string;
  filename: string;
  similarity: number;
};

export type PackRagOptions = {
  /** Drop weak vector hits; fallback rows often use similarity 1.0. */
  minSimilarity?: number;
  /** Approx char budget for packed chunk bodies. */
  maxChars?: number;
  /** HTTP request id for retrieve error logs (ignored by packer). */
  requestId?: string;
};

export function packRelevantChunks(
  chunks: RagChunk[],
  options: PackRagOptions = {}
): RagChunk[] {
  const minSimilarity = options.minSimilarity ?? 0.25;
  const maxChars = options.maxChars ?? 6000;

  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  // Prisma/$queryRaw may return numeric similarity as string — coerce before filter.
  const normalized = chunks.map((c) => ({
    ...c,
    similarity: Number(c?.similarity),
  }));

  const filtered = normalized.filter(
    (c) => Number.isFinite(c.similarity) && c.similarity >= minSimilarity
  );

  const ordered = [...filtered].sort((a, b) => b.similarity - a.similarity);
  const packed: RagChunk[] = [];
  let used = 0;

  for (const chunk of ordered) {
    const len = String(chunk.content || '').length;
    if (packed.length > 0 && used + len > maxChars) break;
    packed.push(chunk);
    used += len;
  }

  return packed;
}
