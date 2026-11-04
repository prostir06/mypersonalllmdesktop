import logger from '../logger';
import { decryptSecret, EncryptionConfigError } from './secretCrypto';

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
export async function resolveOpenAiApiKey(
  userId: number
): Promise<string | null> {
  try {
    const prismaModule = await import('../config/prisma');
    const prisma = prismaModule.default || prismaModule.prisma;
    const row = await prisma.userSettings.findUnique({
      where: { userId },
      select: { openaiApiKeyEnc: true },
    });
    if (row?.openaiApiKeyEnc) {
      try {
        const plain = decryptSecret(row.openaiApiKeyEnc, userId);
        if (plain && !isPlaceholderOpenAiKey(plain)) return plain.trim();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof EncryptionConfigError) {
          logger.warn(`resolveOpenAiApiKey: ${message}`);
        } else {
        logger.warn(
          `resolveOpenAiApiKey decrypt failed for user ${userId}: ${message}`
        );
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`resolveOpenAiApiKey settings load failed: ${message}`);
  }

  return envOpenAiKey();
}
