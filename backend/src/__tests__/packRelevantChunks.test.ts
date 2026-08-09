import { packRelevantChunks } from '../utils/packRelevantChunks';

describe('packRelevantChunks', () => {
  it('filters below minSimilarity and packs by char budget', () => {
    const chunks = [
      { content: 'AAA', filename: 'a', similarity: 0.9 },
      { content: 'BBB', filename: 'b', similarity: 0.1 },
      { content: 'CCCCCC', filename: 'c', similarity: 0.8 },
    ];

    expect(
      packRelevantChunks(chunks, { minSimilarity: 0.25, maxChars: 5 })
    ).toEqual([{ content: 'AAA', filename: 'a', similarity: 0.9 }]);
  });

  it('keeps high-similarity fallback rows and returns empty for junk', () => {
    expect(
      packRelevantChunks([{ content: 'x', filename: 'f', similarity: 1 }], {
        minSimilarity: 0.25,
      })
    ).toEqual([{ content: 'x', filename: 'f', similarity: 1 }]);
    expect(packRelevantChunks([])).toEqual([]);
    expect(packRelevantChunks(null as any)).toEqual([]);
  });

  it('accepts similarity returned as string (Postgres numeric)', () => {
    expect(
      packRelevantChunks(
        [
          {
            content: 'doc body',
            filename: 'Контекст.txt',
            similarity: '1.0' as unknown as number,
          },
        ],
        { minSimilarity: 0 }
      )
    ).toEqual([
      { content: 'doc body', filename: 'Контекст.txt', similarity: 1 },
    ]);
  });
});
