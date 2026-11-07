import express from 'express';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    userSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
  prisma: {
    userSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../services/embeddings/resolveEmbeddingContext', () => ({
  resolveEmbeddingContext: jest.fn().mockResolvedValue({ provider: 'none' }),
  invalidateEmbeddingContextCache: jest.fn(),
}));

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

import prisma from '../config/prisma';
import settingsRouter from '../routes/settings';

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRouter);

const mockedPrisma = prisma as unknown as {
  userSettings: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
};

describe('Settings API (Prisma)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET without token returns defaults including system_prompt', async () => {
    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      default_model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 4096,
      default_provider: 'openai',
      system_prompt: '',
      tools_enabled: true,
      has_openai_api_key: false,
      has_gemini_api_key: false,
      has_anthropic_api_key: false,
      rag_embedding_mode: 'fallback',
    });
    expect(res.body).toHaveProperty('default_ollama_host');
    expect(res.body).not.toHaveProperty('defaultModel');
    expect(mockedPrisma.userSettings.findUnique).not.toHaveBeenCalled();
  });

  it('GET with valid token and row returns snake_case including system_prompt', async () => {
    const token = jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      id: 1,
      userId: 9,
      defaultModel: 'gpt-4o',
      temperature: { toString: () => '0.5' }, // Decimal-like
      maxTokens: 1500,
      defaultProvider: 'openai',
      defaultOllamaHost: 'http://ollama.local/v1',
      systemPrompt: 'Be concise',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      default_model: 'gpt-4o',
      temperature: 0.5,
      max_tokens: 1500,
      default_provider: 'openai',
      default_ollama_host: 'http://ollama.local/v1',
      system_prompt: 'Be concise',
      tools_enabled: true,
      has_openai_api_key: false,
      has_gemini_api_key: false,
      has_anthropic_api_key: false,
      rag_embedding_mode: 'fallback',
    });
    expect(mockedPrisma.userSettings.findUnique).toHaveBeenCalledWith({
      where: { userId: 9 },
    });
  });

  it('PUT upserts partial update and returns full snake_case row', async () => {
    const token = jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
    mockedPrisma.userSettings.findUnique.mockResolvedValue({
      id: 1,
      userId: 9,
      defaultModel: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 2000,
      defaultProvider: 'openai',
      defaultOllamaHost: 'http://127.0.0.1:11434/v1/chat/completions',
      systemPrompt: '',
    });
    mockedPrisma.userSettings.upsert.mockResolvedValue({
      id: 1,
      userId: 9,
      defaultModel: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 2000,
      defaultProvider: 'openai',
      defaultOllamaHost: 'http://127.0.0.1:11434/v1/chat/completions',
      systemPrompt: 'Hi',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    });

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ default_model: 'gpt-4o', system_prompt: 'Hi' });

    expect(res.status).toBe(200);
    expect(res.body.default_model).toBe('gpt-4o');
    expect(res.body.system_prompt).toBe('Hi');
    expect(res.body.user_id).toBe(9);
    expect(res.body).toHaveProperty('id');
    expect(mockedPrisma.userSettings.upsert).toHaveBeenCalled();
    const upsertArg = mockedPrisma.userSettings.upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({ userId: 9 });
    expect(upsertArg.create.defaultModel).toBe('gpt-4o');
    expect(upsertArg.create.systemPrompt).toBe('Hi');
  });

  it('PUT returns 400 for invalid temperature', async () => {
    const token = jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ temperature: 99 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(mockedPrisma.userSettings.upsert).not.toHaveBeenCalled();
  });

  it('PUT encrypts openai_api_key and GET reports has_openai_api_key', async () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const token = jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
    mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
    mockedPrisma.userSettings.upsert.mockImplementation(async (args: any) => ({
      id: 2,
      userId: 9,
      ...args.create,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const putRes = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ openai_api_key: 'sk-user-secret-key' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.has_openai_api_key).toBe(true);
    expect(JSON.stringify(putRes.body)).not.toMatch(/sk-user-secret/);
    const enc = mockedPrisma.userSettings.upsert.mock.calls[0][0].create.openaiApiKeyEnc;
    expect(typeof enc).toBe('string');
    expect(enc).not.toContain('sk-user');
  });

  it('PUT returns 400 when gemini_api_key is placeholder', async () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const token = jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ gemini_api_key: 'your_gemini_api_key_here' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid Google Gemini API key/);
    expect(mockedPrisma.userSettings.upsert).not.toHaveBeenCalled();
  });

  it('PUT encrypts gemini_api_key and clear_gemini_api_key unsets it', async () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const token = jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
    mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
    mockedPrisma.userSettings.upsert.mockImplementation(async (args: any) => ({
      id: 2,
      userId: 9,
      ...args.create,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const putRes = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ gemini_api_key: 'AIzaSyEncryptedSecret123' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.has_gemini_api_key).toBe(true);
    const enc = mockedPrisma.userSettings.upsert.mock.calls[0][0].create.geminiApiKeyEnc;
    expect(typeof enc).toBe('string');
    expect(enc).not.toContain('AIzaSyEncryptedSecret123');

    // Now clear it
    mockedPrisma.userSettings.upsert.mockImplementation(async (args: any) => ({
      id: 2,
      userId: 9,
      ...args.update,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const clearRes = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ clear_gemini_api_key: true });

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.has_gemini_api_key).toBe(false);
  });

  it('PUT returns 400 when anthropic_api_key is placeholder', async () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const token = jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ anthropic_api_key: 'your_anthropic_api_key_here' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid Anthropic API key/);
    expect(mockedPrisma.userSettings.upsert).not.toHaveBeenCalled();
  });

  it('PUT encrypts anthropic_api_key and clear_anthropic_api_key unsets it', async () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const token = jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
    mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
    mockedPrisma.userSettings.upsert.mockImplementation(async (args: any) => ({
      id: 2,
      userId: 9,
      ...args.create,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const putRes = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ anthropic_api_key: 'sk-ant-api03-test-secret-key-12345' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.has_anthropic_api_key).toBe(true);
    const enc = mockedPrisma.userSettings.upsert.mock.calls[0][0].create.anthropicApiKeyEnc;
    expect(typeof enc).toBe('string');
    expect(enc).not.toContain('sk-ant-api03');

    // Now clear it
    mockedPrisma.userSettings.upsert.mockImplementation(async (args: any) => ({
      id: 2,
      userId: 9,
      ...args.update,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const clearRes = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ clear_anthropic_api_key: true });

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.has_anthropic_api_key).toBe(false);
  });

  it.each(['gemini', 'anthropic'])('PUT accepts %s as default_provider with 4096 max_tokens', async (provider) => {
    const token = jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
    mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
    mockedPrisma.userSettings.upsert.mockImplementation(async (args: any) => ({
      id: 2,
      userId: 9,
      ...args.create,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ default_provider: provider, max_tokens: 4096 });

    expect(res.status).toBe(200);
    expect(res.body.default_provider).toBe(provider);
    expect(res.body.max_tokens).toBe(4096);
  });

  it('PUT updates tools_enabled flag and validates boolean type', async () => {
    const token = jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
    mockedPrisma.userSettings.findUnique.mockResolvedValue(null);
    mockedPrisma.userSettings.upsert.mockImplementation(async (args: any) => ({
      id: 2,
      userId: 9,
      ...args.create,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tools_enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.tools_enabled).toBe(false);
    const upsertCall = mockedPrisma.userSettings.upsert.mock.calls[0][0];
    expect(upsertCall.create.toolsEnabled).toBe(false);

    // Invalid non-boolean value
    const badRes = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tools_enabled: 'not-a-bool' });

    expect(badRes.status).toBe(400);
  });
});
