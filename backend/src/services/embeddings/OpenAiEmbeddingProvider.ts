import axios from 'axios';
import logger from '../../logger';
import { EMBEDDING_DIMENSIONS } from './types';

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BATCH_SIZE = 100;

function truncateText(text: string): string {
  const clean = text.replace(/\n/g, ' ').trim();
  return clean.length > 6000 ? clean.substring(0, 6000) : clean;
}

export class OpenAiEmbeddingProvider {
  static async generateEmbedding(
    text: string,
    apiKey: string
  ): Promise<number[] | null> {
    try {
      const response = await axios.post(
        OPENAI_EMBEDDING_URL,
        {
          model: EMBEDDING_MODEL,
          input: truncateText(text),
          dimensions: EMBEDDING_DIMENSIONS,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      return response.data.data[0].embedding as number[];
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      };
      logger.error(
        `OpenAiEmbeddingProvider.generateEmbedding error: ${
          err.response?.data?.error?.message || err.message
        }`
      );
      return null;
    }
  }

  static async generateBatchEmbeddings(
    texts: string[],
    apiKey: string
  ): Promise<(number[] | null)[]> {
    if (texts.length === 0) return [];

    const cleanTexts = texts.map(truncateText);
    const embeddings: (number[] | null)[] = new Array(texts.length).fill(null);

    try {
      for (
        let offset = 0;
        offset < cleanTexts.length;
        offset += EMBEDDING_BATCH_SIZE
      ) {
        const batch = cleanTexts.slice(offset, offset + EMBEDDING_BATCH_SIZE);
        const response = await axios.post(
          OPENAI_EMBEDDING_URL,
          {
            model: EMBEDDING_MODEL,
            input: batch,
            dimensions: EMBEDDING_DIMENSIONS,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000,
          }
        );

        for (const item of response.data.data as Array<{
          index: number;
          embedding: number[];
        }>) {
          embeddings[offset + item.index] = item.embedding;
        }
      }

      logger.info(
        `OpenAiEmbeddingProvider: Generated ${embeddings.filter(Boolean).length}/${texts.length} embeddings`
      );
      return embeddings;
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      };
      logger.error(
        `OpenAiEmbeddingProvider.generateBatchEmbeddings error: ${
          err.response?.data?.error?.message || err.message
        }`
      );
      return texts.map(() => null);
    }
  }
}
