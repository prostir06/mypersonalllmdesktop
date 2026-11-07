const PLACEHOLDERS = new Set([
  'your_openai_api_key_here',
  'sk-your-key',
  'sk-your-api-key',
  'your-key',
  'placeholder',
  'change_me',
]);

export function isPlaceholderOpenAiKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.length === 0) return true;
  if (PLACEHOLDERS.has(trimmed.toLowerCase())) return true;
  if (/placeholder/i.test(trimmed)) return true;
  if (/^sk-(your[_-]?key|dummy|placeholder|xxx|test)/i.test(trimmed)) return true;
  return false;
}

export function envOpenAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key || isPlaceholderOpenAiKey(key)) return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Prefer per-user encrypted key; fall back to process env.
 */
export async function resolveOpenAiApiKey(userId: number): Promise<string | null> {
  const { resolveProviderKey } = await import('../services/providers/resolveProviderKey');
  return resolveProviderKey(userId, 'openai');
}
