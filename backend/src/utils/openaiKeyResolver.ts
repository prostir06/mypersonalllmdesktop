import prisma from '../config/prisma';
import logger from '../logger';
import { decryptSecret, EncryptionConfigError } from './secretCrypto';

const PLACEHOLDER = 'your_openai_api_key_here';

export function envOpenAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === PLACEHOLDER) return null;
  return key;
}

/**
 * Prefer per-user encrypted key; fall back to process env.
 */
export async function resolveOpenAiApiKey(
  userId: number
): Promise<string | null> {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId },
      select: { openaiApiKeyEnc: true },
    });
    if (row?.openaiApiKeyEnc) {
      try {
        const plain = decryptSecret(row.openaiApiKeyEnc, userId);
        if (plain && plain !== PLACEHOLDER) return plain;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof EncryptionConfigError) {
          logger.warn(`resolveOpenAiApiKey: ${message}`);
        } else {
          logger.warn(`resolveOpenAiApiKey decrypt failed for user ${userId}`);
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`resolveOpenAiApiKey settings load failed: ${message}`);
  }

  return envOpenAiKey();
}
