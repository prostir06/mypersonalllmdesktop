import { chunkText } from '../services/documents/chunking';

describe('chunkText', () => {
  it('keeps ## Sheet: header on each chunk of a long sheet', () => {
    const rows = Array.from({ length: 40 }, (_, i) => `row-${i}-${'x'.repeat(40)}`);
    const text = `## Sheet: Sales\n${rows.join('\n')}`;
    const chunks = chunkText(text, 200, 20);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.startsWith('## Sheet: Sales')).toBe(true);
    }
  });
});
