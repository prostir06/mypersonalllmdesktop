import { modelSupportsTools } from '../../utils/modelCapabilities';

/** First explicit boolean wins. A missing flag is not an override. */
export function readToolsOverride(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

/**
 * Settings decide, unless the client sent its own choice.
 * The model has the last word: no tools when it cannot call them.
 */
export function resolveToolsEnabled(input: {
  settingsEnabled: boolean;
  clientOverride?: boolean;
  model?: string | null;
  provider?: string | null;
}): boolean {
  const requested = input.clientOverride ?? input.settingsEnabled;
  return requested && modelSupportsTools(input.model, input.provider || undefined);
}
