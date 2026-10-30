import prisma from '../config/prisma';
import logger from '../logger';
import {
  encryptSecret,
} from '../utils/secretCrypto';
import { embeddingContextToRagMode } from './embeddings/types';
import {
  resolveEmbeddingContext,
  invalidateEmbeddingContextCache,
} from './embeddings/resolveEmbeddingContext';
import { numTemp } from '../utils/numTemp';

const FALLBACK_OLLAMA =
  process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/v1/chat/completions';

export const KEY_PLACEHOLDER = 'your_openai_api_key_here';

export type UpdateSettingsBody = {
  default_model?: string;
  temperature?: number;
  max_tokens?: number;
  default_provider?: string;
  default_ollama_host?: string;
  system_prompt?: string;
  openai_api_key?: string;
  clear_openai_api_key?: boolean;
  gemini_api_key?: string;
  clear_gemini_api_key?: boolean;
  anthropic_api_key?: string;
  clear_anthropic_api_key?: boolean;
};

export class InvalidOpenAiKeyError extends Error {
  constructor() {
    super('Invalid OpenAI API key');
    this.name = 'InvalidOpenAiKeyError';
  }
}

export class InvalidGeminiKeyError extends Error {
  constructor() {
    super('Invalid Google Gemini API key');
    this.name = 'InvalidGeminiKeyError';
  }
}

export class InvalidAnthropicKeyError extends Error {
  constructor() {
    super('Invalid Anthropic API key');
    this.name = 'InvalidAnthropicKeyError';
  }
}

export const InvalidClaudeKeyError = InvalidAnthropicKeyError;

export function defaultSettings() {
  return {
    default_model: 'gpt-3.5-turbo',
    temperature: 0.7,
    max_tokens: 2000,
    default_provider: 'openai',
    default_ollama_host: FALLBACK_OLLAMA,
    system_prompt: '',
    has_openai_api_key: false,
    has_gemini_api_key: false,
    has_anthropic_api_key: false,
    rag_embedding_mode: 'fallback' as const,
  };
}

function hasEncKey(row: { openaiApiKeyEnc?: string | null }): boolean {
  return Boolean(row.openaiApiKeyEnc && row.openaiApiKeyEnc.length > 0);
}

function hasGeminiKey(row: { geminiApiKeyEnc?: string | null }): boolean {
  return Boolean(row.geminiApiKeyEnc && row.geminiApiKeyEnc.length > 0);
}

function hasAnthropicKey(row: { anthropicApiKeyEnc?: string | null }): boolean {
  return Boolean(row.anthropicApiKeyEnc && row.anthropicApiKeyEnc.length > 0);
}

/** GET public subset — never returns key material */
export async function toPublicSettingsAsync(row: {
  defaultModel: string;
  temperature: unknown;
  maxTokens: number;
  defaultProvider: string;
  defaultOllamaHost: string | null;
  systemPrompt: string;
  openaiApiKeyEnc?: string | null;
  geminiApiKeyEnc?: string | null;
  anthropicApiKeyEnc?: string | null;
  userId?: number;
}) {
  const base = {
    default_model: row.defaultModel,
    temperature: numTemp(row.temperature),
    max_tokens: row.maxTokens,
    default_provider: row.defaultProvider,
    default_ollama_host: row.defaultOllamaHost || FALLBACK_OLLAMA,
    system_prompt: row.systemPrompt ?? '',
    has_openai_api_key: hasEncKey(row),
    has_gemini_api_key: hasGeminiKey(row),
    has_anthropic_api_key: hasAnthropicKey(row),
    rag_embedding_mode: 'fallback' as 'openai' | 'ollama' | 'fallback',
  };

  if (row.userId != null) {
    const ctx = await resolveEmbeddingContext(row.userId);
    base.rag_embedding_mode = embeddingContextToRagMode(ctx);
  }

  return base;
}

/** PUT full row */
export function toSettingsRow(row: {
  id: number;
  userId: number;
  defaultModel: string;
  temperature: unknown;
  maxTokens: number;
  defaultProvider: string;
  defaultOllamaHost: string | null;
  systemPrompt: string;
  openaiApiKeyEnc?: string | null;
  geminiApiKeyEnc?: string | null;
  anthropicApiKeyEnc?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    user_id: row.userId,
    default_model: row.defaultModel,
    temperature: numTemp(row.temperature),
    max_tokens: row.maxTokens,
    default_provider: row.defaultProvider,
    default_ollama_host: row.defaultOllamaHost || FALLBACK_OLLAMA,
    system_prompt: row.systemPrompt ?? '',
    has_openai_api_key: hasEncKey(row),
    has_gemini_api_key: hasGeminiKey(row),
    has_anthropic_api_key: hasAnthropicKey(row),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function getSettingsForUser(userId: number | undefined) {
  const defaults = defaultSettings();
  if (!userId) return defaults;
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!row) return defaults;
    return toPublicSettingsAsync({ ...row, userId });
  } catch (dbError: unknown) {
    const message = dbError instanceof Error ? dbError.message : String(dbError);
    logger.warn(`Settings GET failed, falling back to defaults: ${message}`);
    return defaults;
  }
}

export async function updateSettingsForUser(
  userId: number,
  body: UpdateSettingsBody
) {
  const {
    default_model,
    temperature,
    max_tokens,
    default_provider,
    default_ollama_host,
    system_prompt,
    openai_api_key,
    clear_openai_api_key,
    gemini_api_key,
    clear_gemini_api_key,
    anthropic_api_key,
    clear_anthropic_api_key,
  } = body;

  const existing = await prisma.userSettings.findUnique({
    where: { userId },
  });

  const data: {
    defaultModel: string;
    temperature: number;
    maxTokens: number;
    defaultProvider: string;
    defaultOllamaHost: string;
    systemPrompt: string;
    openaiApiKeyEnc?: string | null;
    geminiApiKeyEnc?: string | null;
    anthropicApiKeyEnc?: string | null;
  } = {
    defaultModel: default_model || existing?.defaultModel || 'gpt-3.5-turbo',
    temperature: temperature ?? (existing ? numTemp(existing.temperature) : 0.7),
    maxTokens: max_tokens ?? existing?.maxTokens ?? 2000,
    defaultProvider: default_provider || existing?.defaultProvider || 'openai',
    defaultOllamaHost:
      default_ollama_host || existing?.defaultOllamaHost || FALLBACK_OLLAMA,
    systemPrompt:
      system_prompt !== undefined ? system_prompt : existing?.systemPrompt || '',
  };

  const clearKey =
    clear_openai_api_key === true ||
    (typeof openai_api_key === 'string' && openai_api_key.trim() === '');

  if (clearKey && (clear_openai_api_key === true || openai_api_key !== undefined)) {
    data.openaiApiKeyEnc = null;
  } else if (typeof openai_api_key === 'string' && openai_api_key.trim()) {
    const trimmed = openai_api_key.trim();
    if (trimmed === KEY_PLACEHOLDER) {
      throw new InvalidOpenAiKeyError();
    }
    data.openaiApiKeyEnc = encryptSecret(trimmed, userId);
  }

  const clearGemini =
    clear_gemini_api_key === true ||
    (typeof gemini_api_key === 'string' && gemini_api_key.trim() === '');

  if (clearGemini && (clear_gemini_api_key === true || gemini_api_key !== undefined)) {
    data.geminiApiKeyEnc = null;
  } else if (typeof gemini_api_key === 'string' && gemini_api_key.trim()) {
    const trimmed = gemini_api_key.trim();
    if (trimmed === KEY_PLACEHOLDER || trimmed === 'your_gemini_api_key_here') {
      throw new InvalidGeminiKeyError();
    }
    data.geminiApiKeyEnc = encryptSecret(trimmed, userId);
  }

  const clearAnthropic =
    clear_anthropic_api_key === true ||
    (typeof anthropic_api_key === 'string' && anthropic_api_key.trim() === '');

  if (clearAnthropic && (clear_anthropic_api_key === true || anthropic_api_key !== undefined)) {
    data.anthropicApiKeyEnc = null;
  } else if (typeof anthropic_api_key === 'string' && anthropic_api_key.trim()) {
    const trimmed = anthropic_api_key.trim();
    if (trimmed === KEY_PLACEHOLDER || trimmed === 'your_anthropic_api_key_here') {
      throw new InvalidAnthropicKeyError();
    }
    data.anthropicApiKeyEnc = encryptSecret(trimmed, userId);
  }

  invalidateEmbeddingContextCache(userId);

  const row = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  return toSettingsRow(row);
}
