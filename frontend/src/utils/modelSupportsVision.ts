/**
 * Resolve vision support from catalog metadata (supports_vision), not name heuristics.
 */
export type VisionCatalogEntry = {
  model_id?: string;
  supports_vision?: boolean;
};

export function modelSupportsVision(
  modelId: string | null | undefined,
  catalog: VisionCatalogEntry[] | null | undefined = []
): boolean {
  if (!modelId) return false;
  const row = (catalog || []).find((m) => m?.model_id === modelId);
  return Boolean(row?.supports_vision);
}
