import { GoogleGenAI } from '@google/genai';
import logger from '../logger';
import { isAbortError } from '../utils/requestAbort';
import {
  buildTokenUsage,
  invokeStreamTokenCallback,
  isAbortOrCallbackError,
} from './providers/shared';
import { ChatError } from './chat/types';
import type { RagSource, TokenUsage } from './chat/types';
import type { NormalizedToolCall } from './providers/types';
import { buildGeminiPayload, pushGeminiToolCall } from './gemini/formatters';

export type { GeminiContent, GeminiMessagePart } from './gemini/formatters';
export { buildGeminiPayload } from './gemini/formatters';

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
  return buildTokenUsage(
    usageMetadata.promptTokenCount ?? 0,
    usageMetadata.candidatesTokenCount ?? 0,
    model || 'gemini-2.0-flash',
    usageMetadata.totalTokenCount
  );
}

function isInvalidGeminiKey(error: { status?: number; message?: string }): boolean {
  const message = error.message || '';
  return (
    error.status === 401 ||
    error.status === 403 ||
    message.includes('API_KEY_INVALID') ||
    message.includes('API key not valid')
  );
}

function mapGeminiError(error: any, logLabel: string, fallbackPrefix: string): never {
  if (
    isAbortOrCallbackError(error) ||
    isAbortError(error) ||
    error?.code === 'ERR_CANCELED' ||
    error instanceof ChatError
  ) {
    throw error;
  }
  logger.error(`${logLabel}: ${error?.message || error}`);
  if (error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
    throw new ChatError(429, 'Перевищено ліміт запитів Gemini API. Будь ласка, зачекайте або спробуйте іншу модель.', { cause: error });
  }
  if (isInvalidGeminiKey(error)) {
    throw new ChatError(401, 'Недійсний Google Gemini API key. Будь ласка, перевірте ключ у Налаштуваннях або у файлі .env.', { cause: error });
  }
  if (error?.status === 400) {
    throw new ChatError(400, `Некоректний запит до Gemini: ${error?.message || 'невідома причина'}`, { cause: error });
  }
  throw new ChatError(500, `${fallbackPrefix}: ${error?.message || 'Невідома помилка'}`, { cause: error });
}

function collectResponseToolCalls(response: {
  functionCalls?: () => Array<{ id?: string; name?: string; args?: unknown }> | undefined;
  candidates?: Array<{ content?: { parts?: Array<{ functionCall?: { id?: string; name?: string; args?: unknown } }> } }>;
}): NormalizedToolCall[] {
  const toolCalls: NormalizedToolCall[] = [];
  const parts = response.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (part?.functionCall) pushGeminiToolCall(toolCalls, part.functionCall);
    }
  }
  if (toolCalls.length === 0 && typeof response.functionCalls === 'function') {
    const calls = response.functionCalls();
    if (Array.isArray(calls)) {
      for (const call of calls) pushGeminiToolCall(toolCalls, call);
    }
  }
  return toolCalls;
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

    const toolCalls = collectResponseToolCalls(response as any);

    const groundingChunks = (candidate as any)?.groundingMetadata?.groundingChunks;
    const sources = formatGroundingSources(groundingChunks);

    const tokenUsage = formatGeminiTokenUsage(response.usageMetadata, model);

    return {
      content: text,
      tokenUsage,
      sources,
      model,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  } catch (error: any) {
    mapGeminiError(error, 'Gemini send error', 'Помилка Gemini API');
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
    const toolCalls: NormalizedToolCall[] = [];

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

      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts as any[]) {
          if (part.functionCall) pushGeminiToolCall(toolCalls, part.functionCall);
        }
      }

      const chunkText = chunk.text || '';
      if (chunkText) {
        fullText += chunkText;
        invokeStreamTokenCallback(onChunk, chunkText, (msg) => {
          logger.error(`Помилка в onChunk коллбеку: ${msg}`);
        });
      }
      const chunks = (candidate as any)?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks) && chunks.length > 0) {
        finalGroundingChunks = chunks;
      }
    }

    if (isSafetyBlocked) {
      const fallback = 'Відповідь заблоковано фільтрами безпеки Google Gemini.';
      if (!fullText && onChunk) {
        invokeStreamTokenCallback(onChunk, fallback, (msg) => {
          logger.error(`Помилка в onChunk коллбеку: ${msg}`);
        });
      }
      fullText = fallback;
    }

    const sources = formatGroundingSources(finalGroundingChunks);
    const tokenUsage = formatGeminiTokenUsage(finalUsageMetadata, model);
    return {
      content: fullText,
      tokenUsage,
      sources,
      model,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  } catch (error: any) {
    mapGeminiError(error, 'Gemini stream error', 'Помилка стрімінгу Gemini');
  }
}

const geminiService = {
  sendGeminiMessage,
  streamGeminiMessage,
};

export default geminiService;
