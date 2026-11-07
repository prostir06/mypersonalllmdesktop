const PLACEHOLDER = 'your_gemini_api_key_here';

export function envGeminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === PLACEHOLDER) return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function resolveGeminiApiKey(userId: number): Promise<string | null> {
  const { resolveProviderKey } = await import('../services/providers/resolveProviderKey');
  return resolveProviderKey(userId, 'gemini');
}
