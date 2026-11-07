import type { ModelCapabilityFlags } from '../services/providers/types';
import { lookupModelProfile } from '../config/models';

/**
 * Explicit vision-capable model ids (no substring heuristics like "gpt-4*").
 * Keep in sync with OpenAI multimodal chat models we intentionally support.
 */
const VISION_MODEL_IDS = new Set(
  [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4o-2024-05-13',
    'gpt-4o-2024-08-06',
    'gpt-4o-2024-11-20',
    'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09',
    'gpt-4-vision-preview',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'o4-mini',
  ].map((id) => id.toLowerCase())
);

interface CacheEntry {
  flags: ModelCapabilityFlags;
  expiresAt: number;
}

const runtimeCapabilitiesCache = new Map<string, CacheEntry>();

export function clearRuntimeModelCapabilitiesCache(): void {
  runtimeCapabilitiesCache.clear();
}

function detectStaticVision(m: string, provider?: string | null): boolean {
  if (provider === 'gemini' || m.startsWith('gemini-') || m.includes('gemini')) {
    return true;
  }
  if (
    m.startsWith('claude-3') ||
    m.includes('claude-3') ||
    m.includes('claude-sonnet-4') ||
    m.includes('claude-opus-4') ||
    m.includes('claude-haiku-4')
  ) {
    return true;
  }
  if (
    VISION_MODEL_IDS.has(m) ||
    m.includes('gpt-4o') ||
    m.includes('gpt-4-turbo') ||
    m.includes('gpt-4.1') ||
    m.includes('o4-mini') ||
    m.includes('vision') ||
    m.includes('llava') ||
    m.includes('pixtral') ||
    m.includes('minicpm') ||
    m.includes('gemma3') ||
    m.includes('gemma-3') ||
    m.includes('gemma4') ||
    m.includes('gemma-4') ||
    m.includes('vl')
  ) {
    return true;
  }
  return false;
}

function detectStaticTools(m: string, provider?: string | null): boolean {
  if (provider === 'gemini' || m.startsWith('gemini-') || m.includes('gemini')) {
    return true;
  }
  if (
    m.startsWith('claude-3') ||
    m.includes('claude-3') ||
    m.includes('claude-sonnet-4') ||
    m.includes('claude-opus-4') ||
    m.includes('claude-haiku-4')
  ) {
    return true;
  }
  if (
    m.includes('gpt-3.5-turbo') ||
    m.startsWith('gpt-4') ||
    m.includes('gpt-4') ||
    m.startsWith('o3') ||
    m.includes('o3-') ||
    m.includes('o3:') ||
    m.startsWith('o4') ||
    m.includes('o4-') ||
    m.includes('o4:')
  ) {
    return true;
  }
  if (
    m.includes('gemma4') ||
    m.includes('gemma-4') ||
    m.includes('qwen2.5') ||
    m.includes('qwen-2.5') ||
    m.includes('qwen3') ||
    m.includes('qwen-3') ||
    m.includes('llama3.1') ||
    m.includes('llama-3.1') ||
    m.includes('llama3.2') ||
    m.includes('llama-3.2') ||
    m.includes('llama3.3') ||
    m.includes('llama-3.3') ||
    m.includes('mistral') ||
    m.includes('mixtral') ||
    m.includes('minicpm') ||
    m.includes('command-r')
  ) {
    return true;
  }
  return false;
}

function detectStaticWebSearchGrounding(m: string, provider?: string | null): boolean {
  if (provider === 'gemini' || m.startsWith('gemini-') || m.includes('gemini')) {
    return true;
  }
  return false;
}

export function registerRuntimeModelCapabilities(
  modelId: string,
  capabilities: string[]
): void {
  if (!modelId || typeof modelId !== 'string') return;
  const key = modelId.trim().toLowerCase();
  if (!key) return;

  const lowerCaps = (Array.isArray(capabilities) ? capabilities : [])
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.toLowerCase().trim());

  const staticVision = detectStaticVision(key);
  const staticTools = detectStaticTools(key);
  const staticWebSearch = detectStaticWebSearchGrounding(key);

  const flags: ModelCapabilityFlags = {
    vision: lowerCaps.includes('vision') || staticVision,
    tools: lowerCaps.includes('tools') || staticTools,
    webSearchGrounding:
      lowerCaps.includes('websearchgrounding') ||
      lowerCaps.includes('web_search_grounding') ||
      lowerCaps.includes('websearch') ||
      staticWebSearch,
  };

  const entry: CacheEntry = {
    flags,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  };

  runtimeCapabilitiesCache.set(key, entry);
  if (key.endsWith(':latest')) {
    runtimeCapabilitiesCache.set(key.slice(0, -7), entry);
  } else if (!key.includes(':')) {
    runtimeCapabilitiesCache.set(`${key}:latest`, entry);
  }
}

export function getModelCapabilities(
  modelId?: string | null,
  provider?: string | null
): ModelCapabilityFlags {
  if (!modelId || typeof modelId !== 'string') {
    return { vision: false, tools: false, webSearchGrounding: false };
  }
  const m = modelId.trim().toLowerCase();
  if (!m) {
    return { vision: false, tools: false, webSearchGrounding: false };
  }

  const cached = runtimeCapabilitiesCache.get(m);
  if (cached) {
    if (Date.now() <= cached.expiresAt) {
      return cached.flags;
    }
    runtimeCapabilitiesCache.delete(m);
  }

  const known = lookupModelProfile(m);
  if (known) {
    return {
      vision: known.vision,
      tools: known.tools,
      webSearchGrounding: known.webSearchGrounding,
    };
  }

  const prov = provider ? provider.trim().toLowerCase() : null;

  return {
    vision: detectStaticVision(m, prov),
    tools: detectStaticTools(m, prov),
    webSearchGrounding: detectStaticWebSearchGrounding(m, prov),
  };
}

export function modelSupportsVision(
  modelId?: string | null,
  provider?: string | null
): boolean {
  return getModelCapabilities(modelId, provider).vision;
}

export function modelSupportsTools(
  modelId?: string | null,
  provider?: string | null
): boolean {
  return getModelCapabilities(modelId, provider).tools;
}
