import express from 'express';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('axios', () => ({
  get: jest.fn(),
}));

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    llmModel: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
  prisma: {
    llmModel: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

import axios from 'axios';
import prisma from '../config/prisma';
import modelsRouter from '../routes/models';

const app = express();
app.use(express.json());
app.use('/api/models', modelsRouter);

const mockedPrisma = prisma as unknown as {
  llmModel: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
};

const mockedAxios = axios as unknown as { get: jest.Mock };

function tokenFor(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
}

const sampleRow = {
  id: 3,
  userId: 9,
  name: 'My GPT',
  modelId: 'gpt-4o',
  description: 'desc',
  provider: 'openai',
  temperature: { toString: () => '0.5' },
  maxTokens: 1500,
  isDefault: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Models API (Prisma)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET / lists user + default models snake_case via Prisma', async () => {
    mockedPrisma.llmModel.findMany.mockResolvedValue([sampleRow]);

    const res = await request(app)
      .get('/api/models')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      id: 3,
      user_id: 9,
      name: 'My GPT',
      model_id: 'gpt-4o',
      max_tokens: 1500,
      is_default: false,
      temperature: 0.5,
    });
    expect(res.body[0]).not.toHaveProperty('modelId');
    expect(mockedPrisma.llmModel.findMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 9 }, { isDefault: true }] },
      orderBy: { name: 'asc' },
    });
  });

  it('POST / creates from camelCase body and returns snake_case', async () => {
    mockedPrisma.llmModel.create.mockResolvedValue({
      ...sampleRow,
      temperature: 0.7,
      maxTokens: 2000,
    });

    const res = await request(app)
      .post('/api/models')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({
        name: 'My GPT',
        modelId: 'gpt-4o',
        description: 'desc',
      });

    expect(res.status).toBe(201);
    expect(res.body.model_id).toBe('gpt-4o');
    expect(res.body.user_id).toBe(9);
    expect(mockedPrisma.llmModel.create).toHaveBeenCalledWith({
      data: {
        userId: 9,
        name: 'My GPT',
        modelId: 'gpt-4o',
        description: 'desc',
        temperature: 0.7,
        maxTokens: 2000,
        provider: 'openai',
      },
    });
  });

  it('POST / returns 400 when name or modelId missing', async () => {
    const res = await request(app)
      .post('/api/models')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ name: 'Only name' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(mockedPrisma.llmModel.create).not.toHaveBeenCalled();
  });

  it('PUT /:id returns 404 when not owned', async () => {
    mockedPrisma.llmModel.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/models/3')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ name: 'X', description: 'd', temperature: 0.2, maxTokens: 100 });

    expect(res.status).toBe(404);
    expect(mockedPrisma.llmModel.update).not.toHaveBeenCalled();
  });

  it('PUT /:id returns 400 for non-digit id', async () => {
    const res = await request(app)
      .put('/api/models/abc')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ name: 'X', description: 'd', temperature: 0.2, maxTokens: 100 });

    expect(res.status).toBe(400);
    expect(mockedPrisma.llmModel.findFirst).not.toHaveBeenCalled();
  });

  it('DELETE /:id uses deleteMany with userId', async () => {
    mockedPrisma.llmModel.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .delete('/api/models/3')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockedPrisma.llmModel.deleteMany).toHaveBeenCalledWith({
      where: { id: 3, userId: 9 },
    });
  });

  it('DELETE /:id returns 404 when count is 0', async () => {
    mockedPrisma.llmModel.deleteMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .delete('/api/models/3')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(404);
  });

  it('GET /remote without token returns 401', async () => {
    const res = await request(app).get(
      '/api/models/remote?provider=ollama'
    );

    expect(res.status).toBe(401);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('GET /remote without provider returns 400', async () => {
    const res = await request(app)
      .get('/api/models/remote')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('provider is required');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('GET /remote rejects disallowed host', async () => {
    const res = await request(app)
      .get(
        '/api/models/remote?provider=ollama&host=http://169.254.169.254/latest'
      )
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('GET /remote ollama returns mapped models from first successful candidate', async () => {
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { models: [{ name: 'llama3' }] },
    });

    const res = await request(app)
      .get(
        '/api/models/remote?provider=ollama&host=http://127.0.0.1:11434/v1/chat/completions'
      )
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'llama3', name: 'llama3', supports_tools: false, supports_vision: false }]);
    expect(mockedAxios.get).toHaveBeenCalled();
    expect(mockedAxios.get.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/tags');
    expect(mockedAxios.get.mock.calls[0][1]).toMatchObject({ maxRedirects: 0 });
  });

  it('GET /remote returns 502 when all candidates fail', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'));

    const res = await request(app)
      .get('/api/models/remote?provider=ollama')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Could not fetch models/i);
  });
});
