import {
  hybridFuse,
  normalizeFtsRanks,
} from '../services/embeddings/hybridFusion';

describe('normalizeFtsRanks', () => {
  it('scales ranks relative to the max in the set', () => {
    const scaled = normalizeFtsRanks([
      { rank: 0.4 },
      { rank: 0.8 },
    ]);
    expect(scaled[0].rank).toBeCloseTo(0.5, 5);
    expect(scaled[1].rank).toBeCloseTo(1, 5);
  });

  it('maps all-zero ranks to 0', () => {
    expect(normalizeFtsRanks([{ rank: 0 }, { rank: 0 }])).toEqual([
      { rank: 0 },
      { rank: 0 },
    ]);
  });
});

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
    expect(fused[0].score).toBeCloseTo(0.8 * 0.7 + 1 * 0.3, 5);
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
        score: 0.3,
      }),
    ]);
  });
});
