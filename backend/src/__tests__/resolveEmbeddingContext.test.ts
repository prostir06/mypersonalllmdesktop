jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    userSettings: { findUnique: jest.fn() },
  },
}));

jest.mock('../utils/openaiKeyResolver', () => ({
  resolveOpenAiApiKey: jest.fn(),
}));

import prisma from '../config/prisma';
import { resolveOpenAiApiKey } from '../utils/openaiKeyResolver';
import { resolveEmbeddingContext } from '../services/embeddings/resolveEmbeddingContext';

const mockedPrisma = prisma as unknown as {
  userSettings: { findUnique: jest.Mock };
};
const mockedKey = resolveOpenAiApiKey as jest.Mock;

describe('resolveEmbeddingContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns openai when user has key', async () => {
    mockedKey.mockResolvedValue('sk-test');
    const ctx = await resolveEmbeddingContext(1);
    expect(ctx).toEqual({ provider: 'openai', openaiKey: 'sk-test' });
    expect(mockedPrisma.userSettings.findUnique).not.toHaveBeenCalled();
  });

  it('returns ollama when no key and defaultProvider ollama', async () => {
    mockedKey.mockResolvedValue(null);
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      defaultProvider: 'ollama',
      defaultOllamaHost: 'http://127.0.0.1:11434/v1/chat/completions',
    });
    const ctx = await resolveEmbeddingContext(2);
    expect(ctx.provider).toBe('ollama');
    expect(ctx.ollamaHost).toContain('11434');
  });

  it('returns none when no key and provider openai', async () => {
    mockedKey.mockResolvedValue(null);
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      defaultProvider: 'openai',
      defaultOllamaHost: 'http://127.0.0.1:11434/v1/chat/completions',
    });
    const ctx = await resolveEmbeddingContext(3);
    expect(ctx).toEqual({ provider: 'none' });
  });
});
