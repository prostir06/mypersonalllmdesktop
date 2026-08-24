import {
  getOllamaEmbedConcurrency,
  mapWithConcurrency,
} from '../utils/mapWithConcurrency';

describe('mapWithConcurrency', () => {
  it('preserves order with concurrency 2', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      await new Promise((r) => setTimeout(r, 10));
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40]);
  });

  it('never exceeds concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('getOllamaEmbedConcurrency clamps env', () => {
    const prev = process.env.OLLAMA_EMBED_CONCURRENCY;
    process.env.OLLAMA_EMBED_CONCURRENCY = '2';
    expect(getOllamaEmbedConcurrency()).toBe(2);
    process.env.OLLAMA_EMBED_CONCURRENCY = '99';
    expect(getOllamaEmbedConcurrency()).toBe(16);
    if (prev === undefined) delete process.env.OLLAMA_EMBED_CONCURRENCY;
    else process.env.OLLAMA_EMBED_CONCURRENCY = prev;
  });
});
