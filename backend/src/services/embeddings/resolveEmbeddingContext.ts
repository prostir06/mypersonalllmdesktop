import prisma from '../../config/prisma';
import { resolveOpenAiApiKey } from '../../utils/openaiKeyResolver';
import type { EmbeddingContext } from './types';

const FALLBACK_OLLAMA =
  process.env.OLLAMA_API_URL ||
  'http://127.0.0.1:11434/v1/chat/completions';

export async function resolveEmbeddingContext(
  userId: number
): Promise<EmbeddingContext> {
  const openaiKey = await resolveOpenAiApiKey(userId);
  if (openaiKey) {
    return { provider: 'openai', openaiKey };
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { defaultProvider: true, defaultOllamaHost: true },
  });

  const defaultProvider = settings?.defaultProvider || 'openai';
  const ollamaHost =
    settings?.defaultOllamaHost || FALLBACK_OLLAMA;

  if (defaultProvider.toLowerCase() === 'ollama' && ollamaHost) {
    return { provider: 'ollama', ollamaHost };
  }

  return { provider: 'none' };
}
