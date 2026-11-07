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

import prisma from '../config/prisma';
import { resolveProviderKey } from '../services/providers/resolveProviderKey';

const findUnique = (prisma as unknown as {
  userSettings: { findUnique: jest.Mock };
}).userSettings.findUnique;

describe('resolveProviderKey', () => {
  const prevOpenAi = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenAi;
  });

  it('returns null for ollama without reading settings', async () => {
    await expect(resolveProviderKey(3, 'ollama')).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns null for an unknown provider without reading settings', async () => {
    await expect(resolveProviderKey(3, 'made-up')).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('loads every stored key column in one query', async () => {
    findUnique.mockResolvedValue(null);
    process.env.OPENAI_API_KEY = 'sk-from-env';

    await expect(resolveProviderKey(3, 'openai')).resolves.toBe('sk-from-env');
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId: 3 },
      select: {
        openaiApiKeyEnc: true,
        geminiApiKeyEnc: true,
        anthropicApiKeyEnc: true,
      },
    });
  });

  it('treats claude as anthropic and still falls back to that env key', async () => {
    findUnique.mockResolvedValue(null);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env';

    await expect(resolveProviderKey(3, 'claude')).resolves.toBe('sk-ant-from-env');
    expect(findUnique).toHaveBeenCalledTimes(1);

    delete process.env.ANTHROPIC_API_KEY;
  });
});
