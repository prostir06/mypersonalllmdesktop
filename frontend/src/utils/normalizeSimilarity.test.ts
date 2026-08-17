import { describe, expect, it } from 'vitest';
import { formatSimilarityPercent } from './normalizeSimilarity';

describe('formatSimilarityPercent', () => {
  it('converts 0..1 scores to percent', () => {
    expect(formatSimilarityPercent(0.9)).toBe('90%');
  });

  it('clamps fused scores above 1', () => {
    expect(formatSimilarityPercent(1.4)).toBe('100%');
  });

  it('returns null for missing values', () => {
    expect(formatSimilarityPercent(undefined)).toBeNull();
  });
});
