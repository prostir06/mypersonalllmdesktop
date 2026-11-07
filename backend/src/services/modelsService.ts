import axios from 'axios';
import prisma from '../config/prisma';
import logger from '../logger';
import {
  assertAllowedHttpUrlWithDns,
  UrlNotAllowedError,
} from '../utils/urlAllowlist';
import {
  modelSupportsVision,
  modelSupportsTools,
  registerRuntimeModelCapabilities,
} from '../utils/modelCapabilities';
import { loadOllamaShowCapabilities } from './ollama/showCapabilities';
import { numTemp } from '../utils/numTemp';

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

export const DEFAULT_GEMINI_MODELS = [
  {
    name: 'Gemini 2.0 Flash',
    modelId: 'gemini-2.0-flash',
    provider: 'gemini',
    maxTokens: 4000,
    temperature: 0.7,
  },
  {
    name: 'Gemini 1.5 Flash',
    modelId: 'gemini-1.5-flash',
    provider: 'gemini',
    maxTokens: 4000,
    temperature: 0.7,
  },
  {
    name: 'Gemini 1.5 Pro',
    modelId: 'gemini-1.5-pro',
    provider: 'gemini',
    maxTokens: 4000,
    temperature: 0.7,
  },
] as const;

export const DEFAULT_CLAUDE_MODELS = [
  {
    name: 'Claude Sonnet 4.5',
    modelId: 'claude-sonnet-4-5',
    provider: 'anthropic',
    maxTokens: 4096,
    temperature: 0.7,
  },
  {
    name: 'Claude Haiku 4.5',
    modelId: 'claude-haiku-4-5',
    provider: 'anthropic',
    maxTokens: 4096,
    temperature: 0.7,
  },
] as const;

export const DEFAULT_MODELS = [
  {
    name: 'GPT-4o mini',
    modelId: 'gpt-4o-mini',
    description: 'Fast and inexpensive model',
    provider: 'openai',
    maxTokens: 4096,
    temperature: 0.7,
    isDefault: true,
  },
  {
    name: 'GPT-4o',
    modelId: 'gpt-4o',
    description: 'Capable general model',
    provider: 'openai',
    maxTokens: 4096,
    temperature: 0.7,
    isDefault: true,
  },
  {
    name: 'GPT-4.1',
    modelId: 'gpt-4.1',
    description: 'Newer general model',
    provider: 'openai',
    maxTokens: 4096,
    temperature: 0.7,
    isDefault: true,
  },
  {
    name: 'Llama 3.2',
    modelId: 'llama3.2',
    description: 'Local Ollama model',
    provider: 'ollama',
    maxTokens: 4096,
    temperature: 0.7,
    isDefault: true,
  },
  ...DEFAULT_CLAUDE_MODELS.map((m) => ({
    name: m.name,
    modelId: m.modelId,
    description: null,
    provider: m.provider,
    maxTokens: m.maxTokens,
    temperature: m.temperature,
    isDefault: true,
  })),
  ...DEFAULT_GEMINI_MODELS.map((m) => ({
    name: m.name,
    modelId: m.modelId,
    description: null,
    provider: m.provider,
    maxTokens: m.maxTokens,
    temperature: m.temperature,
    isDefault: true,
  })),
];

export function parseModelId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
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
    supports_vision: modelSupportsVision(row.modelId, row.provider),
    supports_tools: modelSupportsTools(row.modelId, row.provider),
  };
}

export async function listForUser(userId: number) {
  return prisma.llmModel.findMany({
    where: { OR: [{ userId }, { isDefault: true }] },
    orderBy: { name: 'asc' },
  });
}

export async function createForUser(
  userId: number,
  data: {
    name: string;
    modelId: string;
    description?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: string;
  }
) {
  return prisma.llmModel.create({
    data: {
      userId,
      name: data.name.trim(),
      modelId: data.modelId.trim(),
      description: data.description,
      temperature: data.temperature ?? 0.7,
      maxTokens: data.maxTokens ?? 2000,
      provider: data.provider || 'openai',
    },
  });
}

export async function updateForUser(
  userId: number,
  id: number,
  data: {
    name?: string;
    description?: string;
    temperature?: number;
    maxTokens?: number;
    provider?: string;
  }
) {
  const existing = await prisma.llmModel.findFirst({
    where: { id, userId },
  });
  if (!existing) return null;
  return prisma.llmModel.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      provider: data.provider || 'openai',
    },
  });
}

export async function deleteForUser(userId: number, id: number) {
  return prisma.llmModel.deleteMany({ where: { id, userId } });
}

export class RemoteModelsError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'RemoteModelsError';
  }
}

async function enrichOllamaListing(
  listed: Array<{ id: string; tagCapabilities?: string[] }>,
  origin: string
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < listed.length) {
      const item = listed[cursor];
      cursor += 1;
      if (!item?.id) continue;
      const shown = await loadOllamaShowCapabilities(item.id, origin);
      if (!shown && item.tagCapabilities) {
        registerRuntimeModelCapabilities(item.id, item.tagCapabilities);
      }
    }
  };
  const workers = Math.min(4, listed.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

export async function discoverRemoteOllamaModels(
  host?: string
): Promise<
  {
    id: string;
    name: string;
    supports_vision?: boolean;
    supports_tools?: boolean;
  }[]
> {
  const hostUrl =
    host ||
    process.env.OLLAMA_API_URL ||
    'http://127.0.0.1:11434/v1/chat/completions';

  let origin: string;
  try {
    origin = (await assertAllowedHttpUrlWithDns(hostUrl)).origin;
  } catch (err: unknown) {
    if (err instanceof UrlNotAllowedError) {
      throw new RemoteModelsError(err.statusCode, err.message);
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

  let models: {
    id: string;
    name: string;
    supports_vision?: boolean;
    supports_tools?: boolean;
  }[] | null = null;
  for (const url of candidates) {
    try {
      const r = await axios.get(url, { timeout: 5000, maxRedirects: 0 });
      if (r.status === 200 && r.data) {
        const data = r.data.models || r.data.data || r.data.engines || r.data;
        if (Array.isArray(data)) {
          const listed = data.map((m: unknown) => {
            if (typeof m === 'string') return { id: m, tagCapabilities: undefined as string[] | undefined };
            const obj = m as {
              name?: string;
              id?: string;
              model?: string;
              engine?: string;
              capabilities?: string[];
            };
            return {
              id: obj.name || obj.id || obj.model || obj.engine || '',
              tagCapabilities: Array.isArray(obj.capabilities) ? obj.capabilities : undefined,
            };
          });
          await enrichOllamaListing(listed, origin);
          models = listed.map((item) => ({
            id: item.id,
            name: item.id,
            supports_vision: modelSupportsVision(item.id, 'ollama'),
            supports_tools: modelSupportsTools(item.id, 'ollama'),
          }));
          break;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug(`Ollama discovery: ${url} failed: ${msg}`);
    }
  }

  if (!models) {
    throw new RemoteModelsError(502, 'Could not fetch models from Ollama host');
  }
  return models;
}
