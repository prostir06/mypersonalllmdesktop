/**
 * Map catalog ModelRecord rows to ChatControls { value, label } options.
 * Filters by provider; empty catalog → empty list (caller may prepend selection).
 */
export type CatalogModelLike = {
  model_id?: string;
  name?: string;
  provider?: string;
};

export type ModelOption = { value: string; label: string };

export const DEFAULT_GEMINI_MODEL_OPTIONS: ModelOption[] = [
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
];

export const DEFAULT_CLAUDE_MODEL_OPTIONS: ModelOption[] = [
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
];

export function catalogModelsToOptions(
  catalogModels: CatalogModelLike[] | null | undefined,
  provider: string
): ModelOption[] {
  if (!provider) return [];
  const fromCatalog = Array.isArray(catalogModels)
    ? catalogModels
        .filter((m) => m && m.provider === provider)
        .map((m) => ({
          value: m.model_id || '',
          label: m.name || m.model_id || '',
        }))
        .filter((opt) => Boolean(opt.value))
    : [];

  if (fromCatalog.length > 0) {
    return fromCatalog;
  }

  if (provider === 'gemini') {
    return [...DEFAULT_GEMINI_MODEL_OPTIONS];
  }

  if (provider === 'anthropic') {
    return [...DEFAULT_CLAUDE_MODEL_OPTIONS];
  }

  return [];
}
