export type HybridVectorRow = {
  key: string;
  content: string;
  filename: string;
  similarity: number;
};

export type HybridFtsRow = {
  key: string;
  content: string;
  filename: string;
  rank: number;
};

export type HybridFusedRow = {
  key: string;
  content: string;
  filename: string;
  score: number;
};

/** Weighted score fusion for vector + keyword hits. */
export function hybridFuse(
  vectorRows: HybridVectorRow[],
  ftsRows: HybridFtsRow[],
  alpha = 0.7,
  beta = 0.3
): HybridFusedRow[] {
  const byKey = new Map<string, HybridFusedRow>();

  for (const v of vectorRows) {
    byKey.set(v.key, {
      key: v.key,
      content: v.content,
      filename: v.filename,
      score: alpha * v.similarity,
    });
  }

  for (const f of ftsRows) {
    const add = beta * f.rank;
    const existing = byKey.get(f.key);
    if (existing) {
      existing.score += add;
    } else {
      byKey.set(f.key, {
        key: f.key,
        content: f.content,
        filename: f.filename,
        score: add,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => b.score - a.score);
}
