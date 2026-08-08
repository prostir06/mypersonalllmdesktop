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

export function catalogModelsToOptions(
  catalogModels: CatalogModelLike[] | null | undefined,
  provider: string
): ModelOption[] {
  if (!Array.isArray(catalogModels) || !provider) return [];
  return catalogModels
    .filter((m) => m && m.provider === provider)
    .map((m) => ({
      value: m.model_id || '',
      label: m.name || m.model_id || '',
    }))
    .filter((opt) => Boolean(opt.value));
}
