jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    userSettings: { findUnique: jest.fn() },
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../utils/secretCrypto', () => ({
  EncryptionConfigError: class EncryptionConfigError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'EncryptionConfigError';
    }
  },
  decryptSecret: jest.fn(),
}));

import prisma from '../config/prisma';
import logger from '../logger';
import { decryptSecret } from '../utils/secretCrypto';
import { resolveOpenAiApiKey } from '../utils/openaiKeyResolver';

const mockedPrisma = prisma as unknown as {
  userSettings: { findUnique: jest.Mock };
};
const mockedDecrypt = decryptSecret as jest.Mock;

describe('resolveOpenAiApiKey', () => {
  const prevKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-env-fallback';
  });

  afterAll(() => {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  });

  it('logs decrypt failures with the original message and falls back to env', async () => {
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      openaiApiKeyEnc: 'blob',
    });
    mockedDecrypt.mockImplementation(() => {
      throw new Error('Invalid ciphertext');
    });

    await expect(resolveOpenAiApiKey(7)).resolves.toBe('sk-env-fallback');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid ciphertext')
    );
  });
});
