import { hybridFuse } from '../services/embeddings/hybridFusion';

describe('hybridFuse', () => {
  it('merges vector and fts scores for the same chunk key', () => {
    const fused = hybridFuse(
      [
        {
          key: '1',
          content: 'same chunk',
          filename: 'a.txt',
          similarity: 0.8,
        },
      ],
      [
        {
          key: '1',
          content: 'same chunk',
          filename: 'a.txt',
          rank: 0.5,
        },
      ]
    );

    expect(fused).toHaveLength(1);
    expect(fused[0].score).toBeCloseTo(0.8 * 0.7 + 0.5 * 0.3, 5);
  });

  it('includes fts-only rows when vector misses them', () => {
    const fused = hybridFuse(
      [],
      [
        {
          key: '2',
          content: 'keyword only',
          filename: 'b.txt',
          rank: 0.9,
        },
      ]
    );

    expect(fused).toEqual([
      expect.objectContaining({
        key: '2',
        content: 'keyword only',
        score: 0.9 * 0.3,
      }),
    ]);
  });
});
