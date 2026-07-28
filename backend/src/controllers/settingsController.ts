import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import logger from '../logger';

type SettingsRequest = Request & { userId?: number };

const FALLBACK_OLLAMA =
  process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/v1/chat/completions';

export function defaultSettings() {
  return {
    default_model: 'gpt-3.5-turbo',
    temperature: 0.7,
    max_tokens: 2000,
    default_provider: 'openai',
    default_ollama_host: FALLBACK_OLLAMA,
    system_prompt: '',
  };
}

function numTemp(value: unknown): number {
  if (value == null) return 0.7;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return Number(value);
}

/** GET public subset */
export function toPublicSettings(row: {
  defaultModel: string;
  temperature: unknown;
  maxTokens: number;
  defaultProvider: string;
  defaultOllamaHost: string | null;
  systemPrompt: string;
}) {
  return {
    default_model: row.defaultModel,
    temperature: numTemp(row.temperature),
    max_tokens: row.maxTokens,
    default_provider: row.defaultProvider,
    default_ollama_host: row.defaultOllamaHost || FALLBACK_OLLAMA,
    system_prompt: row.systemPrompt ?? '',
  };
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
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function getSettings(req: SettingsRequest, res: Response): Promise<void> {
  const defaults = defaultSettings();

  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const secret = process.env.JWT_SECRET;
      if (secret) {
        const decoded = jwt.verify(token, secret) as { userId: number };
        req.userId = decoded.userId;
      }
    } catch {
      logger.warn('Invalid token on settings GET, falling back to defaults');
    }
  }

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
      res.json(toPublicSettings(row));
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn(`Settings GET failed, falling back to defaults: ${message}`);
      res.json(defaults);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in GET /settings: ${message}`);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
}

export async function updateSettings(
  req: SettingsRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'No token, authorization denied' });
    return;
  }

  const {
    default_model,
    temperature,
    max_tokens,
    default_provider,
    default_ollama_host,
    system_prompt,
  } = req.body as {
    default_model?: string;
    temperature?: number;
    max_tokens?: number;
    default_provider?: string;
    default_ollama_host?: string;
    system_prompt?: string;
  };

  try {
    const existing = await prisma.userSettings.findUnique({
      where: { userId: req.userId },
    });

    const data = {
      defaultModel: default_model || existing?.defaultModel || 'gpt-3.5-turbo',
      temperature: temperature ?? (existing ? numTemp(existing.temperature) : 0.7),
      maxTokens: max_tokens ?? existing?.maxTokens ?? 2000,
      defaultProvider: default_provider || existing?.defaultProvider || 'openai',
      defaultOllamaHost:
        default_ollama_host || existing?.defaultOllamaHost || FALLBACK_OLLAMA,
      systemPrompt:
        system_prompt !== undefined ? system_prompt : existing?.systemPrompt || '',
    };

    const row = await prisma.userSettings.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...data },
      update: data,
    });

    res.json(toSettingsRow(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in PUT /settings: ${message}`);
    next(error);
  }
}
