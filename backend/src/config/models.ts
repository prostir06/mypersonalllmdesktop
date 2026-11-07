export type MaxTokensField = 'max_tokens' | 'max_completion_tokens';

export type ModelProfile = {
  tools: boolean;
  vision: boolean;
  webSearchGrounding: boolean;
  temperature: boolean;
  maxTokensField: MaxTokensField;
};

const CHAT_PROFILE: ModelProfile = {
  tools: true,
  vision: true,
  webSearchGrounding: false,
  temperature: true,
  maxTokensField: 'max_tokens',
};

const REASONING_PROFILE: ModelProfile = {
  tools: true,
  vision: false,
  webSearchGrounding: false,
  temperature: false,
  maxTokensField: 'max_completion_tokens',
};

/** Longest-prefix wins. Keys are lowercase model ids or stable prefixes. */
const MODEL_PROFILES: Record<string, ModelProfile> = {
  'gpt-4o-mini': CHAT_PROFILE,
  'gpt-4o': CHAT_PROFILE,
  'gpt-4.1': CHAT_PROFILE,
  'claude-sonnet-4-5': CHAT_PROFILE,
  'claude-haiku-4-5': CHAT_PROFILE,
  'claude-sonnet-4': CHAT_PROFILE,
  'claude-opus-4': CHAT_PROFILE,
  'gemini-2.0-flash': {
    ...CHAT_PROFILE,
    webSearchGrounding: true,
  },
  'o1': REASONING_PROFILE,
  'o3': REASONING_PROFILE,
  'o4': { ...REASONING_PROFILE, vision: true },
  'gpt-5': {
    ...CHAT_PROFILE,
    temperature: false,
    maxTokensField: 'max_completion_tokens',
  },
};

function readEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

export function defaultOpenAiModel(): string {
  return readEnv('OPENAI_DEFAULT_MODEL', 'gpt-4o-mini');
}

export function defaultAnthropicModel(): string {
  return readEnv('ANTHROPIC_DEFAULT_MODEL', 'claude-sonnet-4-5');
}

export function defaultGeminiModel(): string {
  return readEnv('GEMINI_DEFAULT_MODEL', 'gemini-2.0-flash');
}

export function defaultOllamaModel(): string {
  return readEnv('OLLAMA_DEFAULT_MODEL', 'llama3.2');
}

export function defaultModelFor(provider?: string | null): string {
  switch ((provider || 'openai').toLowerCase().trim()) {
    case 'anthropic':
    case 'claude':
      return defaultAnthropicModel();
    case 'gemini':
      return defaultGeminiModel();
    case 'ollama':
      return defaultOllamaModel();
    default:
      return defaultOpenAiModel();
  }
}

export function lookupModelProfile(modelId?: string | null): ModelProfile | undefined {
  if (!modelId || typeof modelId !== 'string') return undefined;
  const normalized = modelId.toLowerCase().trim();
  if (!normalized) return undefined;
  if (MODEL_PROFILES[normalized]) return MODEL_PROFILES[normalized];

  let bestKey = '';
  let best: ModelProfile | undefined;
  for (const [key, profile] of Object.entries(MODEL_PROFILES)) {
    if (key.length <= bestKey.length) continue;
    if (normalized.startsWith(`${key}-`) || normalized.startsWith(`${key}.`)) {
      bestKey = key;
      best = profile;
    }
  }
  return best;
}
