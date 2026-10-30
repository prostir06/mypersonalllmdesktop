import { GoogleGenAI } from '@google/genai';
import logger from '../logger';
import { isAbortError } from '../utils/requestAbort';
import { calculateTokenCost } from '../utils/tokenCostCalculator';
import { ChatError } from './chat/types';
import type { RagSource, TokenUsage } from './chat/types';

export type GeminiMessagePart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiMessagePart[];
};

export function formatGroundingSources(chunks?: Array<{ web?: { uri?: string; title?: string } }>): RagSource[] {
  if (!Array.isArray(chunks)) return [];
  const results: RagSource[] = [];
  chunks.forEach((chunk, idx) => {
    if (chunk.web?.uri) {
      const uri = chunk.web.uri;
      let fallback: string;
      try {
        fallback = new URL(uri).hostname;
      } catch {
        // Fall back to raw URI when it is not a valid absolute URL (e.g. malformed or relative)
        fallback = uri;
      }
      const title = chunk.web.title || fallback;
      results.push({
        id: `web-${idx}`,
        document_id: 0,
        filename: title,
        chunk_index: idx,
        snippet: title,
        url: uri,
        score: 1.0,
        source_type: 'web_search',
      });
    }
  });
  return results;
}

export function formatGeminiTokenUsage(
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  },
  model?: string
): TokenUsage | undefined {
  if (!usageMetadata) return undefined;
  const promptTokens = usageMetadata.promptTokenCount ?? 0;
  const completionTokens = usageMetadata.candidatesTokenCount ?? 0;
  const totalTokens =
    usageMetadata.totalTokenCount ?? (promptTokens + completionTokens);
  const estimatedCostUsd = calculateTokenCost(
    model || 'gemini-2.0-flash',
    promptTokens,
    completionTokens
  );
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
  };
}

export function buildGeminiPayload(
  messages: Array<{ role: string; content?: unknown }>,
  options: Record<string, unknown> = {}
) {
  let systemInstructionText = '';
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemInstructionText += (systemInstructionText ? '\n\n' : '') + msg.content;
      }
      continue;
    }

    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiMessagePart[] = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<{ type?: string; text?: string; image_url?: { url?: string } }>) {
        if (part.type === 'text' && part.text) {
          parts.push({ text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  const enableWebSearch = options.enableWebSearch === true;
  const config: Record<string, unknown> = {
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
    maxOutputTokens: typeof options.max_tokens === 'number' ? options.max_tokens : 2000,
  };

  if (options.signal instanceof AbortSignal) {
    config.abortSignal = options.signal;
  }

  if (systemInstructionText.trim().length > 0) {
    config.systemInstruction = { parts: [{ text: systemInstructionText.trim() }] };
  }

  if (enableWebSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  return { contents, config };
}

async function sendGeminiMessage(
  messages: Array<{ role: string; content?: unknown }>,
  model = 'gemini-2.0-flash',
  options: Record<string, unknown> = {}
) {
  const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : null;
  if (!apiKey) {
    throw new ChatError(
      400,
      'Google Gemini API key не налаштовано. Будь ласка, додайте ключ у Налаштуваннях або у файлі .env.'
    );
  }

  const signal = options.signal instanceof AbortSignal ? options.signal : undefined;
  if (signal?.aborted) {
    const err = new Error('Generation stopped by user');
    err.name = 'AbortError';
    throw err;
  }

  const ai = new GoogleGenAI({ apiKey });
  const { contents, config } = buildGeminiPayload(messages, options);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: contents as any,
      config: config as any,
    });

    const candidate = response.candidates?.[0];
    let text = response.text || '';
    if (candidate?.finishReason === 'SAFETY') {
      text = 'Відповідь заблоковано фільтрами безпеки Google Gemini.';
    }

    const groundingChunks = (candidate as any)?.groundingMetadata?.groundingChunks;
    const sources = formatGroundingSources(groundingChunks);

    const tokenUsage = formatGeminiTokenUsage(response.usageMetadata, model);

    return { content: text, tokenUsage, sources, model };
  } catch (error: any) {
    if (
      isAbortError(error) ||
      error?.name === 'AbortError' ||
      error?.code === 'ERR_CANCELED' ||
      error?.code === 'ABORT_ERR' ||
      error instanceof ChatError
    ) {
      throw error;
    }
    logger.error(`Gemini send error: ${error?.message || error}`);
    if (error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new ChatError(429, 'Перевищено ліміт запитів Gemini API. Будь ласка, зачекайте або спробуйте іншу модель.');
    }
    if (
      error?.status === 400 ||
      error?.status === 401 ||
      error?.status === 403 ||
      error?.message?.includes('API_KEY_INVALID') ||
      error?.message?.includes('API key not valid')
    ) {
      throw new ChatError(401, 'Недійсний Google Gemini API key. Будь ласка, перевірте ключ у Налаштуваннях або у файлі .env.');
    }
    throw new ChatError(500, `Помилка Gemini API: ${error?.message || 'Невідома помилка'}`);
  }
}

async function streamGeminiMessage(
  messages: Array<{ role: string; content?: unknown }>,
  model = 'gemini-2.0-flash',
  options: Record<string, unknown> = {},
  onChunk?: (token: string) => void
) {
  const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : null;
  if (!apiKey) {
    throw new ChatError(
      400,
      'Google Gemini API key не налаштовано. Будь ласка, додайте ключ у Налаштуваннях або у файлі .env.'
    );
  }

  const signal = options.signal instanceof AbortSignal ? options.signal : undefined;
  if (signal?.aborted) {
    const err = new Error('Generation stopped by user');
    err.name = 'AbortError';
    throw err;
  }

  const ai = new GoogleGenAI({ apiKey });
  const { contents, config } = buildGeminiPayload(messages, options);

  try {
    const responseStream = await ai.models.generateContentStream({
      model,
      contents: contents as any,
      config: config as any,
    });

    let fullText = '';
    let finalGroundingChunks: any[] = [];
    let isSafetyBlocked = false;
    let finalUsageMetadata: any = undefined;

    for await (const chunk of responseStream) {
      if (signal?.aborted) {
        const err = new Error('Generation stopped by user');
        err.name = 'AbortError';
        throw err;
      }

      if (chunk.usageMetadata) {
        finalUsageMetadata = chunk.usageMetadata;
      }

      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') {
        isSafetyBlocked = true;
      }

      const chunkText = chunk.text || '';
      if (chunkText) {
        fullText += chunkText;
        if (onChunk) {
          try {
            onChunk(chunkText);
          } catch (cbError: unknown) {
            // Rethrow abort errors so client cancellation terminates the stream
            if (
              isAbortError(cbError) ||
              (cbError &&
                typeof cbError === 'object' &&
                ((cbError as { name?: string }).name === 'AbortError' ||
                  (cbError as { code?: string }).code === 'ABORT_ERR'))
            ) {
              throw cbError;
            }
            logger.error(
              `Помилка в onChunk коллбеку: ${
                cbError instanceof Error ? cbError.message : String(cbError)
              }`
            );
          }
        }
      }
      const chunks = (candidate as any)?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks) && chunks.length > 0) {
        finalGroundingChunks = chunks;
      }
    }

    if (isSafetyBlocked) {
      const fallback = 'Відповідь заблоковано фільтрами безпеки Google Gemini.';
      if (!fullText && onChunk) {
        try {
          onChunk(fallback);
        } catch (cbError: unknown) {
          if (
            isAbortError(cbError) ||
            (cbError &&
              typeof cbError === 'object' &&
              ((cbError as { name?: string }).name === 'AbortError' ||
                (cbError as { code?: string }).code === 'ABORT_ERR'))
          ) {
            throw cbError;
          }
        }
      }
      fullText = fallback;
    }

    const sources = formatGroundingSources(finalGroundingChunks);
    const tokenUsage = formatGeminiTokenUsage(finalUsageMetadata, model);
    return { content: fullText, tokenUsage, sources, model };
  } catch (error: any) {
    if (
      isAbortError(error) ||
      error?.name === 'AbortError' ||
      error?.code === 'ERR_CANCELED' ||
      error?.code === 'ABORT_ERR' ||
      error instanceof ChatError
    ) {
      throw error;
    }
    logger.error(`Gemini stream error: ${error?.message || error}`);
    if (error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new ChatError(429, 'Перевищено ліміт запитів Gemini API. Будь ласка, зачекайте або спробуйте іншу модель.');
    }
    if (
      error?.status === 400 ||
      error?.status === 401 ||
      error?.status === 403 ||
      error?.message?.includes('API_KEY_INVALID') ||
      error?.message?.includes('API key not valid')
    ) {
      throw new ChatError(401, 'Недійсний Google Gemini API key. Будь ласка, перевірте ключ у Налаштуваннях або у файлі .env.');
    }
    throw new ChatError(500, `Помилка стрімінгу Gemini: ${error?.message || 'Невідома помилка'}`);
  }
}

export default {
  sendGeminiMessage,
  streamGeminiMessage,
  formatGeminiTokenUsage,
  formatGroundingSources,
  buildGeminiPayload,
};
