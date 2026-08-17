/** Format hybrid/vector similarity as 0–100% for UI. */
export function formatSimilarityPercent(similarity?: number): string | null {
  if (typeof similarity !== 'number' || Number.isNaN(similarity)) return null;
  const pct = similarity <= 1 ? similarity * 100 : 100;
  const clamped = Math.min(100, Math.max(0, Math.round(pct)));
  return `${clamped}%`;
}
