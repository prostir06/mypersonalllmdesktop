import axios from 'axios';
import logger from '../../logger';
import { resolveOllamaEmbeddingsUrl } from '../../utils/ollamaEmbeddingsUrl';
import {
  getOllamaEmbedConcurrency,
  mapWithConcurrency,
} from '../../utils/mapWithConcurrency';
import { UrlNotAllowedError } from '../../utils/urlAllowlist';
import { OLLAMA_EMBED_MODEL } from './types';

function truncateText(text: string): string {
  const clean = text.replace(/\n/g, ' ').trim();
  return clean.length > 6000 ? clean.substring(0, 6000) : clean;
}

export class OllamaEmbeddingProvider {
  static async generateEmbedding(
    text: string,
    ollamaHost: string
  ): Promise<number[] | null> {
    try {
      const apiUrl = resolveOllamaEmbeddingsUrl(ollamaHost);
      const response = await axios.post(
        apiUrl,
        {
          model: OLLAMA_EMBED_MODEL,
          prompt: truncateText(text),
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
          maxRedirects: 0,
        }
      );

      const embedding = response.data?.embedding as number[] | undefined;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        logger.error('OllamaEmbeddingProvider: empty embedding response');
        return null;
      }
      return embedding;
    } catch (error: unknown) {
      // SSRF / allowlist failures must not become soft nulls.
      if (error instanceof UrlNotAllowedError) throw error;
      const err = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      logger.error(
        `OllamaEmbeddingProvider.generateEmbedding error: ${
          err.response?.data?.error || err.message
        }`
      );
      return null;
    }
  }

  static async generateBatchEmbeddings(
    texts: string[],
    ollamaHost: string
  ): Promise<(number[] | null)[]> {
    if (texts.length === 0) return [];

    const concurrency = getOllamaEmbedConcurrency();
    const embeddings = await mapWithConcurrency(texts, concurrency, (text) =>
      this.generateEmbedding(text, ollamaHost)
    );

    logger.info(
      `OllamaEmbeddingProvider: Generated ${embeddings.filter(Boolean).length}/${texts.length} embeddings (concurrency=${concurrency})`
    );
    return embeddings;
  }
}