import prisma from '../config/prisma';
import logger from '../logger';
import { decryptSecret, EncryptionConfigError } from './secretCrypto';

const PLACEHOLDER = 'your_gemini_api_key_here';

export function envGeminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === PLACEHOLDER) return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function resolveGeminiApiKey(userId: number): Promise<string | null> {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId },
      select: { geminiApiKeyEnc: true },
    });
    if (row?.geminiApiKeyEnc && row.geminiApiKeyEnc.trim().length > 0) {
      try {
        const plain = decryptSecret(row.geminiApiKeyEnc, userId);
        if (plain && plain.trim().length > 0 && plain !== PLACEHOLDER) {
          return plain.trim();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof EncryptionConfigError) {
          logger.warn(`resolveGeminiApiKey: ${message}`);
        } else {
          logger.warn(
            `resolveGeminiApiKey decrypt failed for user ${userId}: ${message}`
          );
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`resolveGeminiApiKey settings load failed: ${message}`);
  }

  return envGeminiKey();
}
