import { resolveClaudeApiKey, envClaudeKey } from '../utils/claudeKeyResolver';
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

describe('claudeKeyResolver', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;
  const originalEncKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    if (originalEncKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalEncKey;
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalEnv;
    jest.clearAllMocks();
  });

  it('envClaudeKey returns trimmed process.env.ANTHROPIC_API_KEY or null if placeholder or missing', () => {
    process.env.ANTHROPIC_API_KEY = '  sk-ant-valid-key  ';
    expect(envClaudeKey()).toBe('sk-ant-valid-key');

    process.env.ANTHROPIC_API_KEY = 'your_anthropic_api_key_here';
    expect(envClaudeKey()).toBeNull();

    process.env.ANTHROPIC_API_KEY = '   ';
    expect(envClaudeKey()).toBeNull();

    delete process.env.ANTHROPIC_API_KEY;
    expect(envClaudeKey()).toBeNull();
  });

  it('returns decrypted key from database when present', async () => {
    const rawKey = 'sk-ant-api03-test-secret-key';
    const encrypted = encryptSecret(rawKey, 1);
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      anthropicApiKeyEnc: encrypted,
    });

    const key = await resolveClaudeApiKey(1);
    expect(key).toBe(rawKey);
  });

  it('falls back to ANTHROPIC_API_KEY from env when db has no key', async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue(null);
    process.env.ANTHROPIC_API_KEY = 'env-claude-key-999';

    const key = await resolveClaudeApiKey(1);
    expect(key).toBe('env-claude-key-999');
  });

  it('returns null when neither db nor env has a key', async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      anthropicApiKeyEnc: null,
    });
    delete process.env.ANTHROPIC_API_KEY;

    const key = await resolveClaudeApiKey(1);
    expect(key).toBeNull();
  });

  it('falls back to env when decryption fails and logs a warning', async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      anthropicApiKeyEnc: 'invalid-base64-blob',
    });
    process.env.ANTHROPIC_API_KEY = 'fallback-key';

    const key = await resolveClaudeApiKey(1);
    expect(key).toBe('fallback-key');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('resolveClaudeApiKey decrypt failed for user 1')
    );
  });

  it('falls back to env and logs warning when database query throws', async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockRejectedValue(
      new Error('Connection lost')
    );
    process.env.ANTHROPIC_API_KEY = 'fallback-env-key';

    const key = await resolveClaudeApiKey(1);
    expect(key).toBe('fallback-env-key');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('resolveClaudeApiKey settings load failed: Connection lost')
    );
  });

  it('ignores placeholder value in env and database', async () => {
    process.env.ANTHROPIC_API_KEY = 'your_anthropic_api_key_here';
    expect(envClaudeKey()).toBeNull();

    const encryptedPlaceholder = encryptSecret('your_anthropic_api_key_here', 1);
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      anthropicApiKeyEnc: encryptedPlaceholder,
    });

    const key = await resolveClaudeApiKey(1);
    expect(key).toBeNull();
  });
});
