jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    userSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../services/embeddings/resolveEmbeddingContext', () => ({
  resolveEmbeddingContext: jest.fn().mockResolvedValue({ provider: 'none' }),
  invalidateEmbeddingContextCache: jest.fn(),
}));

import prisma from '../config/prisma';
import {
  defaultSettings,
  toPublicSettingsAsync,
  toSettingsRow,
  updateSettingsForUser,
  InvalidOpenAiKeyError,
  InvalidGeminiKeyError,
} from '../services/settingsService';

const mockedPrisma = prisma as unknown as {
  userSettings: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
};

describe('settingsService mappers and updates', () => {
  const originalEncKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    if (originalEncKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalEncKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaultSettings returns snake_case public shape including has_gemini_api_key', () => {
    const d = defaultSettings();
    expect(d).toMatchObject({
      default_model: 'gpt-3.5-turbo',
      temperature: 0.7,
      max_tokens: 2000,
      default_provider: 'openai',
      system_prompt: '',
      has_openai_api_key: false,
      has_gemini_api_key: false,
      rag_embedding_mode: 'fallback',
    });
    expect(d).toHaveProperty('default_ollama_host');
  });

  it('toSettingsRow never exposes key material', () => {
    const row = toSettingsRow({
      id: 1,
      userId: 9,
      defaultModel: 'gpt-4o',
      temperature: 0.5,
      maxTokens: 1500,
      defaultProvider: 'gemini',
      defaultOllamaHost: null,
      systemPrompt: 'hi',
      openaiApiKeyEnc: 'enc-blob',
      geminiApiKeyEnc: 'gemini-enc-blob',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    });
    expect(row.has_openai_api_key).toBe(true);
    expect(row.has_gemini_api_key).toBe(true);
    expect(row).not.toHaveProperty('openaiApiKeyEnc');
    expect(row).not.toHaveProperty('openai_api_key');
    expect(row).not.toHaveProperty('geminiApiKeyEnc');
    expect(row).not.toHaveProperty('gemini_api_key');
  });

  it('toPublicSettingsAsync sets has_gemini_api_key and has_openai_api_key from enc', async () => {
    const pub = await toPublicSettingsAsync({
      defaultModel: 'gemini-2.0-flash',
      temperature: 0.5,
      maxTokens: 1500,
      defaultProvider: 'gemini',
      defaultOllamaHost: null,
      systemPrompt: '',
      openaiApiKeyEnc: 'x',
      geminiApiKeyEnc: 'y',
      userId: 9,
    });
    expect(pub.has_openai_api_key).toBe(true);
    expect(pub.has_gemini_api_key).toBe(true);
  });

  it('updateSettingsForUser encrypts gemini_api_key and stores in geminiApiKeyEnc', async () => {
    mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
    mockedPrisma.userSettings.upsert.mockImplementation(async (args: any) => ({
      id: 10,
      userId: 5,
      ...args.create,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    }));

    const result = await updateSettingsForUser(5, {
      gemini_api_key: 'AIzaSySecretGeminiKey',
    });

    expect(result.has_gemini_api_key).toBe(true);
    expect(mockedPrisma.userSettings.upsert).toHaveBeenCalled();
    const createArg = mockedPrisma.userSettings.upsert.mock.calls[0][0].create;
    expect(createArg.geminiApiKeyEnc).toBeDefined();
    expect(createArg.geminiApiKeyEnc).not.toContain('AIzaSySecretGeminiKey');
  });

  it('updateSettingsForUser clears gemini_api_key when clear_gemini_api_key is true', async () => {
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      geminiApiKeyEnc: 'existing-encrypted-key',
    });
    mockedPrisma.userSettings.upsert.mockImplementation(async (args: any) => ({
      id: 10,
      userId: 5,
      ...args.update,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    }));

    const result = await updateSettingsForUser(5, {
      clear_gemini_api_key: true,
    });

    expect(result.has_gemini_api_key).toBe(false);
    const updateArg = mockedPrisma.userSettings.upsert.mock.calls[0][0].update;
    expect(updateArg.geminiApiKeyEnc).toBeNull();
  });

  it('updateSettingsForUser rejects placeholder keys with typed errors', async () => {
    mockedPrisma.userSettings.findUnique.mockResolvedValue(null);

    await expect(
      updateSettingsForUser(5, { gemini_api_key: 'your_gemini_api_key_here' })
    ).rejects.toBeInstanceOf(InvalidGeminiKeyError);

    await expect(
      updateSettingsForUser(5, { gemini_api_key: 'your_openai_api_key_here' })
    ).rejects.toBeInstanceOf(InvalidGeminiKeyError);

    await expect(
      updateSettingsForUser(5, { openai_api_key: 'your_openai_api_key_here' })
    ).rejects.toBeInstanceOf(InvalidOpenAiKeyError);
  });
});
