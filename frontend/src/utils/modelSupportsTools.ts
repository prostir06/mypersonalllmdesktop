export function modelSupportsTools(
  modelId: string | null | undefined,
  catalog: Array<{ model_id?: string; supports_tools?: boolean }> | null | undefined = [],
  provider?: string | null
): boolean {
  if (!modelId || typeof modelId !== 'string') return false;
  const row = (catalog || []).find((m) => m?.model_id === modelId);
  if (row?.supports_tools !== undefined) return Boolean(row.supports_tools);
  const p = (provider || '').trim().toLowerCase();
  if (p === 'openai' || p === 'anthropic' || p === 'gemini') return true;
  const m = modelId.trim().toLowerCase();
  return (
    m.includes('gpt') ||
    m.includes('claude') ||
    m.includes('gemini') ||
    m.includes('llama3.1') ||
    m.includes('llama3.2') ||
    m.includes('llama3.3') ||
    m.includes('qwen2.5') ||
    m.includes('qwen3') ||
    m.includes('mistral') ||
    m.includes('mixtral') ||
    m.includes('command-r') ||
    m.includes('firefunction') ||
    m.includes('hermes')
  );
}
