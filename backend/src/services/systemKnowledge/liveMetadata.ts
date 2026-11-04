import {
  ALLOWED_PROVIDERS,
  MIN_TEMPERATURE,
  MAX_TEMPERATURE,
  MIN_MAX_TOKENS,
  MAX_MAX_TOKENS,
} from '../../validators/settingsValidator';
import { getMaxUploadBytes } from '../../utils/fileMagic';
import { getSupportedPricingModels } from '../../utils/tokenCostCalculator';
import {
  MAX_NOTES,
  MAX_NOTE_CHARS,
  DEFAULT_SUMMARY_THRESHOLD,
} from '../conversationMemoryService';
import {
  MAX_USER_NOTES,
  MAX_USER_NOTE_CHARS,
} from '../userMemoryService';
import toolRegistry from '../tools/registry';
import type { LiveSystemMetadata, LiveSystemToolMetadata } from './types';

export function getLiveSystemMetadata(): LiveSystemMetadata {
  const maxBytes = getMaxUploadBytes();
  const maxUploadMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;

  const tools: LiveSystemToolMetadata[] = (toolRegistry?.getAll ? toolRegistry.getAll() : []).map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
  }));

  return {
    allowedProviders: [...ALLOWED_PROVIDERS],
    temperatureRange: { min: MIN_TEMPERATURE, max: MAX_TEMPERATURE, default: 0.7 },
    maxTokensRange: { min: MIN_MAX_TOKENS, max: MAX_MAX_TOKENS, default: 4096 },
    maxUploadMb,
    conversationMemoryMaxNotes: MAX_NOTES,
    conversationMemoryNoteMaxChars: MAX_NOTE_CHARS,
    conversationSummaryThreshold: DEFAULT_SUMMARY_THRESHOLD,
    userMemoryMaxNotes: MAX_USER_NOTES,
    userMemoryNoteMaxChars: MAX_USER_NOTE_CHARS,
    supportedPricingModels: getSupportedPricingModels(),
    tools,
  };
}
