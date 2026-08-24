export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, Math.max(items.length, 0)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export function getOllamaEmbedConcurrency(): number {
  const n = parseInt(process.env.OLLAMA_EMBED_CONCURRENCY || '4', 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 16) : 4;
}
