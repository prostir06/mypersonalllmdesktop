import { GoogleGenAI } from '@google/genai';
import logger from '../logger';
import { ChatError } from './chat/types';
import type { RagSource } from './chat/types';

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

  const ai = new GoogleGenAI({ apiKey });
  const { contents, config } = buildGeminiPayload(messages, options);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: contents as any,
      config: config as any,
    });

    const text = response.text || '';
    const groundingChunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks;
    const sources = formatGroundingSources(groundingChunks);

    return { content: text, sources, model };
  } catch (error: any) {
    if (error instanceof ChatError) throw error;
    logger.error(`Gemini send error: ${error?.message || error}`);
    if (error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new ChatError(429, 'Перевищено ліміт запитів Gemini API. Будь ласка, зачекайте або спробуйте іншу модель.');
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

    for await (const chunk of responseStream) {
      const chunkText = chunk.text || '';
      if (chunkText) {
        fullText += chunkText;
        if (onChunk) onChunk(chunkText);
      }
      const chunks = (chunk.candidates?.[0] as any)?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks) && chunks.length > 0) {
        finalGroundingChunks = chunks;
      }
    }

    const sources = formatGroundingSources(finalGroundingChunks);
    return { content: fullText, sources, model };
  } catch (error: any) {
    if (error instanceof ChatError) throw error;
    logger.error(`Gemini stream error: ${error?.message || error}`);
    if (error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new ChatError(429, 'Перевищено ліміт запитів Gemini API. Будь ласка, зачекайте або спробуйте іншу модель.');
    }
    throw new ChatError(500, `Помилка стрімінгу Gemini: ${error?.message || 'Невідома помилка'}`);
  }
}

export default {
  sendGeminiMessage,
  streamGeminiMessage,
  formatGroundingSources,
  buildGeminiPayload,
};
