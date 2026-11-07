/**
 * Resolve vision support from catalog metadata (supports_vision), with Claude 3/4 and multimodal open-source fallback.
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
  if (row?.supports_vision !== undefined) return row.supports_vision;
  const m = modelId.trim().toLowerCase();
  if (
    m.startsWith('claude-3') ||
    m.includes('claude-3') ||
    m.includes('claude-sonnet-4') ||
    m.includes('claude-opus-4') ||
    m.includes('claude-haiku-4') ||
    m.includes('gemma3') ||
    m.includes('gemma-3') ||
    m.includes('gemma4') ||
    m.includes('gemma-4') ||
    m.includes('qwen2.5vl') ||
    m.includes('qwen2.5-vl') ||
    m.includes('qwen3-vl') ||
    m.includes('minicpm')
  ) {
    return true;
  }
  return false;
}
