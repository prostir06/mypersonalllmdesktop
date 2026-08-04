import { Request, Response } from 'express';
import axios from 'axios';
import prisma from '../config/prisma';
import logger from '../logger';
import {
  assertAllowedHttpUrl,
  UrlNotAllowedError,
} from '../utils/urlAllowlist';

type AuthRequest = Request & { userId?: number };

type LlmModelRow = {
  id: number;
  userId: number | null;
  name: string;
  modelId: string;
  description: string | null;
  provider: string;
  temperature: unknown;
  maxTokens: number;
  isDefault: boolean;
  createdAt: Date;
};

export function parseModelId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function numTemp(value: unknown): number {
  if (value == null) return 0.7;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return Number(value);
}

export function toPublicModel(row: LlmModelRow) {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    model_id: row.modelId,
    description: row.description,
    provider: row.provider,
    temperature: numTemp(row.temperature),
    max_tokens: row.maxTokens,
    is_default: row.isDefault,
    created_at: row.createdAt,
  };
}

export async function listModels(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rows = await prisma.llmModel.findMany({
      where: { OR: [{ userId: req.userId! }, { isDefault: true }] },
      orderBy: { name: 'asc' },
    });
    res.json(rows.map(toPublicModel));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /models error: ${message}`);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
}

export async function createModel(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as {
    name?: string;
    modelId?: string;
    description?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: string;
  };

  try {
    const row = await prisma.llmModel.create({
      data: {
        userId: req.userId!,
        name: body.name!,
        modelId: body.modelId!,
        description: body.description,
        temperature: body.temperature ?? 0.7,
        maxTokens: body.maxTokens ?? 2000,
        provider: body.provider || 'openai',
      },
    });
    res.status(201).json(toPublicModel(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /models error: ${message}`);
    res.status(500).json({ error: 'Failed to create model' });
  }
}

export async function updateModel(req: AuthRequest, res: Response): Promise<void> {
  const id = parseModelId(String(req.params.modelId));
  if (id == null) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  const body = req.body as {
    name?: string;
    description?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: string;
  };

  try {
    const existing = await prisma.llmModel.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!existing) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }

    const row = await prisma.llmModel.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        provider: body.provider || 'openai',
      },
    });
    res.json(toPublicModel(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`PUT /models/${req.params.modelId} error: ${message}`);
    res.status(500).json({ error: 'Failed to update model' });
  }
}

export async function deleteModel(req: AuthRequest, res: Response): Promise<void> {
  const id = parseModelId(String(req.params.modelId));
  if (id == null) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  try {
    const result = await prisma.llmModel.deleteMany({
      where: { id, userId: req.userId! },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`DELETE /models/${req.params.modelId} error: ${message}`);
    res.status(500).json({ error: 'Failed to delete model' });
  }
}

export async function listRemoteModels(req: Request, res: Response): Promise<void> {
  const { provider, host } = req.query as { provider?: string; host?: string };

  if (!provider) {
    res.status(400).json({ error: 'provider is required' });
    return;
  }

  try {
    if ((provider || '').toLowerCase() !== 'ollama') {
      res.status(400).json({ error: 'Unsupported provider for remote discovery' });
      return;
    }

    const hostUrl =
      host ||
      process.env.OLLAMA_API_URL ||
      'http://127.0.0.1:11434/v1/chat/completions';

    let origin: string;
    try {
      origin = assertAllowedHttpUrl(hostUrl).origin;
    } catch (err: unknown) {
      if (err instanceof UrlNotAllowedError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      throw err;
    }

    const candidates = [
      `${origin}/api/tags`,
      `${origin}/v1/models`,
      `${origin}/models`,
      `${origin}/v1/list`,
      `${origin}/v1/engines`,
    ];

    let models: { id: string; name: string }[] | null = null;
    for (const url of candidates) {
      try {
        const r = await axios.get(url, { timeout: 5000 });
        if (r.status === 200 && r.data) {
          const data = r.data.models || r.data.data || r.data || r.data.engines;
          if (Array.isArray(data)) {
            models = data.map((m: unknown) => {
              if (typeof m === 'string') return { id: m, name: m };
              const obj = m as {
                name?: string;
                id?: string;
                model?: string;
                engine?: string;
              };
              const val = obj.name || obj.id || obj.model || obj.engine || '';
              return { id: val, name: val };
            });
            break;
          }
        }
      } catch {
        // try next candidate
      }
    }

    if (!models) {
      res.status(502).json({ error: 'Could not fetch models from Ollama host' });
      return;
    }

    res.json(models);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /models/remote error: ${message}`);
    res.status(500).json({ error: 'Failed to fetch remote models' });
  }
}
