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

import {
  defaultSettings,
  toPublicSettingsAsync,
  toSettingsRow,
} from '../services/settingsService';

describe('settingsService mappers', () => {
  it('defaultSettings returns snake_case public shape', () => {
    const d = defaultSettings();
    expect(d).toMatchObject({
      default_model: 'gpt-3.5-turbo',
      temperature: 0.7,
      max_tokens: 2000,
      default_provider: 'openai',
      system_prompt: '',
      has_openai_api_key: false,
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
      defaultProvider: 'openai',
      defaultOllamaHost: null,
      systemPrompt: 'hi',
      openaiApiKeyEnc: 'enc-blob',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    });
    expect(row.has_openai_api_key).toBe(true);
    expect(row).not.toHaveProperty('openaiApiKeyEnc');
    expect(row).not.toHaveProperty('openai_api_key');
  });

  it('toPublicSettingsAsync sets has_openai_api_key from enc', async () => {
    const pub = await toPublicSettingsAsync({
      defaultModel: 'gpt-4o',
      temperature: 0.5,
      maxTokens: 1500,
      defaultProvider: 'openai',
      defaultOllamaHost: null,
      systemPrompt: '',
      openaiApiKeyEnc: 'x',
      userId: 9,
    });
    expect(pub.has_openai_api_key).toBe(true);
  });
});
