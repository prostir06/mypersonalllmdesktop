import { Response } from 'express';
import prisma from '../config/prisma';
import logger from '../logger';
import {
  encryptSecret,
  EncryptionConfigError,
} from '../utils/secretCrypto';
import { jsonError } from '../utils/httpJson';
import { embeddingContextToRagMode } from '../services/embeddings/types';
import { resolveEmbeddingContext, invalidateEmbeddingContextCache } from '../services/embeddings/resolveEmbeddingContext';
import { numTemp } from '../utils/numTemp';
import type { AuthRequest } from '../types/express';

type SettingsRequest = AuthRequest;

const FALLBACK_OLLAMA =
  process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/v1/chat/completions';

const KEY_PLACEHOLDER = 'your_openai_api_key_here';

export function defaultSettings() {
  return {
    default_model: 'gpt-3.5-turbo',
    temperature: 0.7,
    max_tokens: 2000,
    default_provider: 'openai',
    default_ollama_host: FALLBACK_OLLAMA,
    system_prompt: '',
    has_openai_api_key: false,
    rag_embedding_mode: 'fallback' as const,
  };
}

function hasEncKey(row: { openaiApiKeyEnc?: string | null }): boolean {
  return Boolean(row.openaiApiKeyEnc && row.openaiApiKeyEnc.length > 0);
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
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function getSettings(req: SettingsRequest, res: Response): Promise<void> {
  const defaults = defaultSettings();

  try {
    if (!req.userId) {
      res.json(defaults);
      return;
    }

    try {
      const row = await prisma.userSettings.findUnique({
        where: { userId: req.userId },
      });
      if (!row) {
        res.json(defaults);
        return;
      }
      res.json(await toPublicSettingsAsync({ ...row, userId: req.userId }));
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn(`Settings GET failed, falling back to defaults: ${message}`);
      res.json(defaults);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in GET /settings: ${message}`);
    jsonError(res, req, 500, 'Failed to fetch settings');
  }
}

export async function updateSettings(
  req: SettingsRequest,
  res: Response
): Promise<void> {
  if (!req.userId) {
    jsonError(res, req, 401, 'No token, authorization denied');
    return;
  }

  const {
    default_model,
    temperature,
    max_tokens,
    default_provider,
    default_ollama_host,
    system_prompt,
    openai_api_key,
    clear_openai_api_key,
  } = req.body as {
    default_model?: string;
    temperature?: number;
    max_tokens?: number;
    default_provider?: string;
    default_ollama_host?: string;
    system_prompt?: string;
    openai_api_key?: string;
    clear_openai_api_key?: boolean;
  };

  try {
    const existing = await prisma.userSettings.findUnique({
      where: { userId: req.userId },
    });

    const data: {
      defaultModel: string;
      temperature: number;
      maxTokens: number;
      defaultProvider: string;
      defaultOllamaHost: string;
      systemPrompt: string;
      openaiApiKeyEnc?: string | null;
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
        jsonError(res, req, 400, 'Invalid OpenAI API key');
        return;
      }
      try {
        data.openaiApiKeyEnc = encryptSecret(trimmed, req.userId);
      } catch (err: unknown) {
        if (err instanceof EncryptionConfigError) {
          jsonError(res, req, 503, 'Помилка конфігурації шифрування');
          return;
        }
        throw err;
      }
    }

    invalidateEmbeddingContextCache(req.userId);

    const row = await prisma.userSettings.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...data },
      update: data,
    });

    res.json(toSettingsRow(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in PUT /settings: ${message}`);
    jsonError(res, req, 500, 'Failed to update settings');
  }
}
