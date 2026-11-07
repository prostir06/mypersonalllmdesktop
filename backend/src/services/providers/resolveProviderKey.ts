import logger from '../../logger';
import { decryptSecret, EncryptionConfigError } from '../../utils/secretCrypto';
import { envClaudeKey } from '../../utils/claudeKeyResolver';
import { envGeminiKey } from '../../utils/geminiKeyResolver';
import { envOpenAiKey, isPlaceholderOpenAiKey } from '../../utils/openaiKeyResolver';

type KeyedProvider = 'openai' | 'gemini' | 'anthropic';

const ENCRYPTED_FIELD = {
  openai: 'openaiApiKeyEnc',
  gemini: 'geminiApiKeyEnc',
  anthropic: 'anthropicApiKeyEnc',
} as const;

function normalizeProvider(provider?: string | null): string {
  const name = (provider || 'openai').toLowerCase().trim();
  return name === 'claude' ? 'anthropic' : name;
}

function resolverLabel(provider: KeyedProvider): string {
  if (provider === 'openai') return 'resolveOpenAiApiKey';
  if (provider === 'gemini') return 'resolveGeminiApiKey';
  return 'resolveClaudeApiKey';
}

function envKey(provider: KeyedProvider): string | null {
  if (provider === 'openai') return envOpenAiKey();
  if (provider === 'gemini') return envGeminiKey();
  return envClaudeKey();
}

function isUsableUserKey(provider: KeyedProvider, plain: string): boolean {
  const trimmed = plain.trim();
  if (!trimmed) return false;
  if (provider === 'openai') return !isPlaceholderOpenAiKey(trimmed);
  if (provider === 'gemini') return trimmed !== 'your_gemini_api_key_here';
  return trimmed !== 'your_anthropic_api_key_here';
}

async function loadPrisma() {
  const prismaModule = await import('../../config/prisma');
  return prismaModule.default || prismaModule.prisma;
}

/**
 * User key for a chat provider, then the process env key.
 * Ollama has no key. Shared-key policy for W3 belongs here.
 */
export async function resolveProviderKey(
  userId: number,
  provider?: string | null
): Promise<string | null> {
  const name = normalizeProvider(provider);
  if (name === 'ollama') return null;
  if (name !== 'openai' && name !== 'gemini' && name !== 'anthropic') return null;
  const keyed = name as KeyedProvider;
  const label = resolverLabel(keyed);

  try {
    const prisma = await loadPrisma();
    const row = await prisma.userSettings.findUnique({
      where: { userId },
      select: {
        openaiApiKeyEnc: true,
        geminiApiKeyEnc: true,
        anthropicApiKeyEnc: true,
      },
    });
    const encrypted = row?.[ENCRYPTED_FIELD[keyed]];
    if (typeof encrypted === 'string' && encrypted.trim()) {
      try {
        const plain = decryptSecret(encrypted, userId);
        if (plain && isUsableUserKey(keyed, plain)) return plain.trim();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof EncryptionConfigError) {
          logger.warn(`${label}: ${message}`);
        } else {
          logger.warn(`${label} decrypt failed for user ${userId}: ${message}`);
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`${label} settings load failed: ${message}`);
  }

  return envKey(keyed);
}
