import {
  MAX_MAX_TOKENS,
  MAX_TEMPERATURE,
  MIN_MAX_TOKENS,
  MIN_TEMPERATURE,
} from '../../validators/settingsValidator';

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function clampGeneration(
  settings: { temperature: number; max_tokens: number },
  client: { temperature?: unknown; max_tokens?: unknown }
): { temperature: number; max_tokens: number } {
  const temperature = inRange(client.temperature, MIN_TEMPERATURE, MAX_TEMPERATURE)
    ? client.temperature
    : Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, Number(settings.temperature) || 0.7));
  const max_tokens = inRange(client.max_tokens, MIN_MAX_TOKENS, MAX_MAX_TOKENS)
    ? client.max_tokens
    : Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, Number(settings.max_tokens) || 4096));
  return { temperature, max_tokens };
}

const ALLOWED_OPTION_KEYS = new Set([
  'documentIds',
  'ragEnabled',
  'image',
  'regenerateFromMessageId',
  'activeBranchIds',
  'attachments',
  'enableWebSearch',
  'timezone',
  'toolsEnabled',
  'temperature',
  'max_tokens',
]);

export function pickAllowedOptions(options: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(options)) {
    if (ALLOWED_OPTION_KEYS.has(key)) next[key] = options[key];
  }
  return next;
}
