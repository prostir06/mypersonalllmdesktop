import prisma from '../../config/prisma';
import { resolveOpenAiApiKey } from '../../utils/openaiKeyResolver';
import type { EmbeddingContext } from './types';

const FALLBACK_OLLAMA =
  process.env.OLLAMA_API_URL ||
  'http://127.0.0.1:11434/v1/chat/completions';

const CACHE_TTL_MS = 5_000;
const cache = new Map<number, { ctx: EmbeddingContext; ts: number }>();

async function resolve(userId: number): Promise<EmbeddingContext> {
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

export async function resolveEmbeddingContext(
  userId: number
): Promise<EmbeddingContext> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.ctx;
  }
  const ctx = await resolve(userId);
  cache.set(userId, { ctx, ts: now });
  return ctx;
}

/** Invalidate cache for a user (e.g. after settings update). */
export function invalidateEmbeddingContextCache(userId: number): void {
  cache.delete(userId);
}
