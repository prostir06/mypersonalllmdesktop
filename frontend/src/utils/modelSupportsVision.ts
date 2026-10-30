/**
 * Resolve vision support from catalog metadata (supports_vision), with Claude 3 fallback.
 */
export type VisionCatalogEntry = {
  model_id?: string;
  supports_vision?: boolean;
};

export function modelSupportsVision(
  modelId: string | null | undefined,
  catalog: VisionCatalogEntry[] | null | undefined = []
): boolean {
  if (!modelId || typeof modelId !== 'string') return false;
  const row = (catalog || []).find((m) => m?.model_id === modelId);
  if (row?.supports_vision) return true;
  const m = modelId.trim().toLowerCase();
  if (m.startsWith('claude-3') || m.includes('claude-3')) return true;
  return false;
}
