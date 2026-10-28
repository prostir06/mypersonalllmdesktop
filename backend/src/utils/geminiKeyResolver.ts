import prisma from '../config/prisma';
import { decryptSecret } from './secretCrypto';

export async function resolveGeminiApiKey(userId: number): Promise<string | null> {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId },
      select: { geminiApiKeyEnc: true },
    });
    if (row?.geminiApiKeyEnc && row.geminiApiKeyEnc.trim().length > 0) {
      const plain = decryptSecret(row.geminiApiKeyEnc, userId);
      if (plain && plain.trim().length > 0) {
        return plain.trim();
      }
    }
  } catch {
    // If decryption fails or DB unreachable, fall through to env
  }

  const envKey = process.env.GEMINI_API_KEY;
  if (typeof envKey === 'string' && envKey.trim().length > 0) {
    return envKey.trim();
  }
  return null;
}
