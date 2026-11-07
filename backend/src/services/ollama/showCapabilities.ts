import axios from 'axios';
import logger from '../../logger';
import { assertAllowedHttpUrlWithDns } from '../../utils/urlAllowlist';
import {
  peekOllamaShow,
  rememberOllamaShow,
} from '../../utils/modelCapabilities';
import type { ModelCapabilityFlags } from '../providers/types';

const SHOW_TIMEOUT_MS = 3000;

function flagsFromCapabilities(capabilities: unknown[]): ModelCapabilityFlags {
  const names = capabilities.map((item) => String(item).toLowerCase());
  return {
    vision: names.includes('vision'),
    tools: names.includes('tools'),
    webSearchGrounding: false,
  };
}

export async function loadOllamaShowCapabilities(
  modelId: string,
  hostUrl?: string
): Promise<ModelCapabilityFlags | undefined> {
  const name = typeof modelId === 'string' ? modelId.trim() : '';
  if (!name) return undefined;

  const raw =
    (typeof hostUrl === 'string' && hostUrl.trim()) ||
    process.env.OLLAMA_API_URL ||
    'http://127.0.0.1:11434/v1/chat/completions';

  let origin: string;
  try {
    origin = (await assertAllowedHttpUrlWithDns(raw)).origin;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug?.(`Ollama /api/show host rejected for ${name}: ${message}`);
    return undefined;
  }

  const cacheKey = `${origin}::${name.toLowerCase()}`;
  const cached = peekOllamaShow(cacheKey);
  if (cached) {
    rememberOllamaShow(cacheKey, name, cached);
    return cached;
  }

  try {
    const response = await axios.post(
      `${origin}/api/show`,
      { name },
      { timeout: SHOW_TIMEOUT_MS, maxRedirects: 0 }
    );
    const capabilities = response.data?.capabilities;
    if (!Array.isArray(capabilities)) return undefined;
    const flags = flagsFromCapabilities(capabilities);
    rememberOllamaShow(cacheKey, name, flags);
    return flags;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug?.(`Ollama /api/show failed for ${name}: ${message}`);
    return undefined;
  }
}
