import express from 'express';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    userPrompt: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

import prisma from '../config/prisma';
import promptsRouter from '../routes/prompts';

const app = express();
app.use(express.json());
app.use('/api/prompts', promptsRouter);

const mockedPrisma = prisma as unknown as {
  userPrompt: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

function tokenFor(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
}

const sampleRow = {
  id: 1,
  userId: 9,
  title: 'Concise',
  prompt: 'Be brief',
  isPinned: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Prompts API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET / lists user prompts', async () => {
    mockedPrisma.userPrompt.findMany.mockResolvedValue([sampleRow]);
    const res = await request(app)
      .get('/api/prompts')
      .set('Authorization', `Bearer ${tokenFor(9)}`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      id: 1,
      title: 'Concise',
      is_pinned: true,
    });
  });

  it('POST / creates a prompt', async () => {
    mockedPrisma.userPrompt.create.mockResolvedValue(sampleRow);
    const res = await request(app)
      .post('/api/prompts')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ title: 'Concise', prompt: 'Be brief', is_pinned: true });
    expect(res.status).toBe(201);
    expect(mockedPrisma.userPrompt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 9,
        title: 'Concise',
        isPinned: true,
      }),
    });
  });

  it('PUT /:id updates owned prompt', async () => {
    mockedPrisma.userPrompt.findFirst.mockResolvedValue(sampleRow);
    mockedPrisma.userPrompt.update.mockResolvedValue({
      ...sampleRow,
      isPinned: false,
    });
    const res = await request(app)
      .put('/api/prompts/1')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ is_pinned: false });
    expect(res.status).toBe(200);
    expect(res.body.is_pinned).toBe(false);
  });

  it('DELETE /:id removes owned prompt', async () => {
    mockedPrisma.userPrompt.findFirst.mockResolvedValue(sampleRow);
    mockedPrisma.userPrompt.delete.mockResolvedValue({});
    const res = await request(app)
      .delete('/api/prompts/1')
      .set('Authorization', `Bearer ${tokenFor(9)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
