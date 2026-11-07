const PLACEHOLDER = 'your_anthropic_api_key_here';

export function envClaudeKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === PLACEHOLDER) return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function resolveClaudeApiKey(userId: number): Promise<string | null> {
  const { resolveProviderKey } = await import('../services/providers/resolveProviderKey');
  return resolveProviderKey(userId, 'anthropic');
}
