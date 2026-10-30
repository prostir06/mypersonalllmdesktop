/**
 * Explicit vision-capable model ids (no substring heuristics like "gpt-4*").
 * Keep in sync with OpenAI multimodal chat models we intentionally support.
 */
const VISION_MODEL_IDS = new Set(
  [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4o-2024-05-13',
    'gpt-4o-2024-08-06',
    'gpt-4o-2024-11-20',
    'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09',
    'gpt-4-vision-preview',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'o4-mini',
  ].map((id) => id.toLowerCase())
);

export function modelSupportsVision(modelId?: string | null): boolean {
  if (!modelId || typeof modelId !== 'string') return false;
  const m = modelId.trim().toLowerCase();
  if (m.startsWith('gemini-')) return true;
  if (m.startsWith('claude-3') || m.includes('claude-3')) return true;
  return (
    VISION_MODEL_IDS.has(m) ||
    m.includes('vision') ||
    m.includes('gpt-4o') ||
    m.includes('gpt-4-turbo') ||
    m.includes('llava')
  );
}
