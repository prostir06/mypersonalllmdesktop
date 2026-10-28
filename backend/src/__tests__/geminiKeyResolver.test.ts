import { resolveGeminiApiKey, envGeminiKey } from '../utils/geminiKeyResolver';
import prisma from '../config/prisma';
import logger from '../logger';
import { encryptSecret } from '../utils/secretCrypto';

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    userSettings: {
      findUnique: jest.fn(),
    },
  },
}));

describe('geminiKeyResolver', () => {
  const originalEnv = process.env.GEMINI_API_KEY;
  const originalEncKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    if (originalEncKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalEncKey;
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnv;
    jest.clearAllMocks();
  });

  it('returns decrypted key from database when present', async () => {
    const rawKey = 'AIzaSyTestKey12345';
    const encrypted = encryptSecret(rawKey, 1);
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      geminiApiKeyEnc: encrypted,
    });

    const key = await resolveGeminiApiKey(1);
    expect(key).toBe(rawKey);
  });

  it('falls back to GEMINI_API_KEY from env when db has no key', async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue(null);
    process.env.GEMINI_API_KEY = 'env-gemini-key-999';

    const key = await resolveGeminiApiKey(1);
    expect(key).toBe('env-gemini-key-999');
  });

  it('returns null when neither db nor env has a key', async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      geminiApiKeyEnc: null,
    });
    delete process.env.GEMINI_API_KEY;

    const key = await resolveGeminiApiKey(1);
    expect(key).toBeNull();
  });

  it('falls back to env when decryption fails and logs a warning', async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      geminiApiKeyEnc: 'invalid-base64-blob',
    });
    process.env.GEMINI_API_KEY = 'fallback-key';

    const key = await resolveGeminiApiKey(1);
    expect(key).toBe('fallback-key');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('resolveGeminiApiKey decrypt failed for user 1')
    );
  });

  it('falls back to env and logs warning when database query throws', async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockRejectedValue(
      new Error('Connection lost')
    );
    process.env.GEMINI_API_KEY = 'fallback-env-key';

    const key = await resolveGeminiApiKey(1);
    expect(key).toBe('fallback-env-key');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('resolveGeminiApiKey settings load failed: Connection lost')
    );
  });

  it('ignores placeholder value in env and database', async () => {
    process.env.GEMINI_API_KEY = 'your_gemini_api_key_here';
    expect(envGeminiKey()).toBeNull();

    const encryptedPlaceholder = encryptSecret('your_gemini_api_key_here', 1);
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      geminiApiKeyEnc: encryptedPlaceholder,
    });

    const key = await resolveGeminiApiKey(1);
    expect(key).toBeNull();
  });
});
