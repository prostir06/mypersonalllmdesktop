import prisma from '../config/prisma';
import logger from '../logger';
import { decryptSecret, EncryptionConfigError } from './secretCrypto';

const PLACEHOLDER = 'your_anthropic_api_key_here';

export function envClaudeKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === PLACEHOLDER) return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function resolveClaudeApiKey(userId: number): Promise<string | null> {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId },
      select: { anthropicApiKeyEnc: true },
    });
    if (row?.anthropicApiKeyEnc && row.anthropicApiKeyEnc.trim().length > 0) {
      try {
        const plain = decryptSecret(row.anthropicApiKeyEnc, userId);
        if (plain && plain.trim().length > 0 && plain !== PLACEHOLDER) {
          return plain.trim();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof EncryptionConfigError) {
          logger.warn(`resolveClaudeApiKey: ${message}`);
        } else {
          logger.warn(
            `resolveClaudeApiKey decrypt failed for user ${userId}: ${message}`
          );
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`resolveClaudeApiKey settings load failed: ${message}`);
  }

  return envClaudeKey();
}
