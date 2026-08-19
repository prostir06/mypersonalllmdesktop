/**
 * Embedding orchestration: provider selection + retrieve façade.
 */
import logger from '../logger';
import { OpenAiEmbeddingProvider } from './embeddings/OpenAiEmbeddingProvider';
import { OllamaEmbeddingProvider } from './embeddings/OllamaEmbeddingProvider';
import { findRelevantChunks } from './embeddings/retrieve';
import { resetEmbeddingColumnCache } from './embeddings/schemaColumns';
import type { EmbeddingContext } from './embeddings/types';

class EmbeddingService {
  static resetEmbeddingColumnCache = resetEmbeddingColumnCache;

  static findRelevantChunks = findRelevantChunks;

  static isAvailable(ctx: EmbeddingContext): boolean {
    if (ctx.provider === 'openai') return Boolean(ctx.openaiKey);
    if (ctx.provider === 'ollama') return Boolean(ctx.ollamaHost);
    return false;
  }

  static async generateEmbedding(
    text: string,
    ctx: EmbeddingContext
  ): Promise<number[] | null> {
    if (ctx.provider === 'openai' && ctx.openaiKey) {
      return OpenAiEmbeddingProvider.generateEmbedding(text, ctx.openaiKey);
    }
    if (ctx.provider === 'ollama' && ctx.ollamaHost) {
      return OllamaEmbeddingProvider.generateEmbedding(text, ctx.ollamaHost);
    }
    logger.warn(
      'EmbeddingService: no embedding provider configured. Skipping embedding generation.'
    );
    return null;
  }

  static async generateBatchEmbeddings(
    texts: string[],
    ctx: EmbeddingContext
  ): Promise<(number[] | null)[]> {
    if (ctx.provider === 'openai' && ctx.openaiKey) {
      return OpenAiEmbeddingProvider.generateBatchEmbeddings(
        texts,
        ctx.openaiKey
      );
    }
    if (ctx.provider === 'ollama' && ctx.ollamaHost) {
      return OllamaEmbeddingProvider.generateBatchEmbeddings(
        texts,
        ctx.ollamaHost
      );
    }
    logger.warn(
      'EmbeddingService: no embedding provider configured. Skipping batch embedding.'
    );
    return texts.map(() => null);
  }
}

export default EmbeddingService;
