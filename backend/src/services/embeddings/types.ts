export type EmbeddingProviderName = 'openai' | 'ollama' | 'none';

export type EmbeddingContext = {
  provider: EmbeddingProviderName;
  openaiKey?: string | null;
  ollamaHost?: string | null;
};

export const EMBEDDING_DIMENSIONS = 768;
export const OLLAMA_EMBED_MODEL =
  process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

export type RagEmbeddingMode = 'openai' | 'ollama' | 'fallback';

export function embeddingContextToRagMode(
  ctx: EmbeddingContext
): RagEmbeddingMode {
  if (ctx.provider === 'openai') return 'openai';
  if (ctx.provider === 'ollama') return 'ollama';
  return 'fallback';
}
