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
import { defaultGeminiModel } from '../config/models';

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

type GroundingChunk = { web?: { uri?: string; title?: string } };

type GeminiCandidateWithGrounding = {
  finishReason?: string;
  content?: {
    parts?: Array<{
      functionCall?: { id?: string; name?: string; args?: unknown };
    }>;
  };
  groundingMetadata?: {
    groundingChunks?: GroundingChunk[];
  };
};

type GeminiResponseWithCandidates = {
  functionCalls?: () => Array<{ id?: string; name?: string; args?: unknown }> | undefined;
  candidates?: GeminiCandidateWithGrounding[];
};

function mapGeminiError(error: unknown, logLabel: string, fallbackPrefix: string): never {
  const errObj = (error && typeof error === 'object' ? error : {}) as {
    code?: string;
    status?: number;
    message?: string;
  };
  if (
    isAbortOrCallbackError(error) ||
    isAbortError(error) ||
    errObj.code === 'ERR_CANCELED' ||
    error instanceof ChatError
  ) {
    throw error;
  }
  logger.error(`${logLabel}: ${errObj.message || String(error)}`);
  if (errObj.status === 429 || errObj.message?.includes('RESOURCE_EXHAUSTED')) {
    throw new ChatError(429, 'Перевищено ліміт запитів Gemini API. Будь ласка, зачекайте або спробуйте іншу модель.', { cause: error });
  }
  if (isInvalidGeminiKey(errObj)) {
    throw new ChatError(401, 'Недійсний Google Gemini API key. Будь ласка, перевірте ключ у Налаштуваннях або у файлі .env.', { cause: error });
  }
  if (errObj.status === 400) {
    throw new ChatError(400, `Некоректний запит до Gemini: ${errObj.message || 'невідома причина'}`, { cause: error });
  }
  throw new ChatError(500, `${fallbackPrefix}: ${errObj.message || 'Невідома помилка'}`, { cause: error });
}

function collectResponseToolCalls(response: GeminiResponseWithCandidates): NormalizedToolCall[] {
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
  model = defaultGeminiModel(),
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
    const requestParams = {
      model,
      contents,
      config,
    } as unknown as Parameters<typeof ai.models.generateContent>[0];
    const response = await ai.models.generateContent(requestParams);

    const candidate = response.candidates?.[0] as unknown as GeminiCandidateWithGrounding | undefined;
    let text = response.text || '';
    if (candidate?.finishReason === 'SAFETY') {
      text = 'Відповідь заблоковано фільтрами безпеки Google Gemini.';
    }

    const toolCalls = collectResponseToolCalls(response as unknown as GeminiResponseWithCandidates);

    const groundingChunks = candidate?.groundingMetadata?.groundingChunks;
    const sources = formatGroundingSources(groundingChunks);

    const tokenUsage = formatGeminiTokenUsage(response.usageMetadata, model);

    return {
      content: text,
      tokenUsage,
      sources,
      model,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  } catch (error: unknown) {
    mapGeminiError(error, 'Gemini send error', 'Помилка Gemini API');
  }
}

async function streamGeminiMessage(
  messages: Array<{ role: string; content?: unknown }>,
  model = defaultGeminiModel(),
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
    const requestStreamParams = {
      model,
      contents,
      config,
    } as unknown as Parameters<typeof ai.models.generateContentStream>[0];
    const responseStream = await ai.models.generateContentStream(requestStreamParams);

    let fullText = '';
    let finalGroundingChunks: GroundingChunk[] = [];
    let isSafetyBlocked = false;
    let finalUsageMetadata: Parameters<typeof formatGeminiTokenUsage>[0] = undefined;
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

      const candidate = chunk.candidates?.[0] as unknown as GeminiCandidateWithGrounding | undefined;
      if (candidate?.finishReason === 'SAFETY') {
        isSafetyBlocked = true;
      }

      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
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
      const chunks = candidate?.groundingMetadata?.groundingChunks;
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
  } catch (error: unknown) {
    mapGeminiError(error, 'Gemini stream error', 'Помилка стрімінгу Gemini');
  }
}

const geminiService = {
  sendGeminiMessage,
  streamGeminiMessage,
};

export default geminiService;
