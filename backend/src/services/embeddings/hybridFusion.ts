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

/** Scale FTS ranks to 0..1 relative to the max rank in this result set. */
export function normalizeFtsRanks<T extends { rank: number }>(rows: T[]): T[] {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.rank) || 0), 0);
  if (max <= 0) {
    return rows.map((r) => ({ ...r, rank: 0 }));
  }
  return rows.map((r) => ({ ...r, rank: (Number(r.rank) || 0) / max }));
}

/** Weighted score fusion for vector + keyword hits (FTS ranks max-normalized). */
export function hybridFuse(
  vectorRows: HybridVectorRow[],
  ftsRows: HybridFtsRow[],
  alpha = 0.7,
  beta = 0.3
): HybridFusedRow[] {
  const byKey = new Map<string, HybridFusedRow>();
  const scaledFts = normalizeFtsRanks(ftsRows);

  for (const v of vectorRows) {
    byKey.set(v.key, {
      key: v.key,
      content: v.content,
      filename: v.filename,
      score: alpha * v.similarity,
    });
  }

  for (const f of scaledFts) {
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
