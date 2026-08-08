/**
 * Map catalog ModelRecord rows to ChatControls { value, label } options.
 * Filters by provider; empty catalog → empty list (caller may prepend selection).
 */
export function catalogModelsToOptions(catalogModels, provider) {
  if (!Array.isArray(catalogModels) || !provider) return [];
  return catalogModels
    .filter((m) => m && m.provider === provider)
    .map((m) => ({
      value: m.model_id,
      label: m.name || m.model_id,
    }))
    .filter((opt) => Boolean(opt.value));
}
