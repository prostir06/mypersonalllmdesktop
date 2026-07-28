import express from 'express';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    conversation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
  },
  prisma: {
    conversation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
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
import conversationsRouter from '../routes/conversations';

const app = express();
app.use(express.json());
app.use('/api/conversations', conversationsRouter);

const mockedPrisma = prisma as unknown as {
  conversation: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
  message: {
    findMany: jest.Mock;
  };
};

function tokenFor(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const sampleRow = {
  id: 5,
  userId: 9,
  title: 'Hello',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('Conversations API (Prisma)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET / returns list snake_case ordered via Prisma findMany', async () => {
    mockedPrisma.conversation.findMany.mockResolvedValue([sampleRow]);

    const res = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 5,
        title: 'Hello',
        created_at: sampleRow.createdAt.toISOString(),
        updated_at: sampleRow.updatedAt.toISOString(),
      },
    ]);
    expect(res.body[0]).not.toHaveProperty('userId');
    expect(mockedPrisma.conversation.findMany).toHaveBeenCalledWith({
      where: { userId: 9 },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  });

  it('GET /:id returns 404 for non-digit id', async () => {
    const res = await request(app)
      .get('/api/conversations/abc')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(404);
    expect(mockedPrisma.conversation.findFirst).not.toHaveBeenCalled();
  });

  it('GET /:id returns snake_case row for owner', async () => {
    mockedPrisma.conversation.findFirst.mockResolvedValue(sampleRow);

    const res = await request(app)
      .get('/api/conversations/5')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 5,
      user_id: 9,
      title: 'Hello',
    });
    expect(res.body).not.toHaveProperty('userId');
    expect(mockedPrisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { id: 5, userId: 9 },
    });
  });

  it('POST / creates with default title Нова розмова', async () => {
    mockedPrisma.conversation.create.mockResolvedValue({
      ...sampleRow,
      title: 'Нова розмова',
    });

    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Нова розмова');
    expect(res.body.user_id).toBe(9);
    expect(mockedPrisma.conversation.create).toHaveBeenCalledWith({
      data: { userId: 9, title: 'Нова розмова' },
    });
  });

  it('PUT /:id returns 404 when not owned', async () => {
    mockedPrisma.conversation.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/conversations/5')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ title: 'X' });

    expect(res.status).toBe(404);
    expect(mockedPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it('DELETE /:id uses deleteMany with userId and does not call message.delete', async () => {
    mockedPrisma.conversation.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .delete('/api/conversations/5')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockedPrisma.conversation.deleteMany).toHaveBeenCalledWith({
      where: { id: 5, userId: 9 },
    });
    expect((mockedPrisma as any).message?.deleteMany).toBeUndefined();
  });

  it('DELETE /:id returns 404 when count is 0', async () => {
    mockedPrisma.conversation.deleteMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .delete('/api/conversations/5')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(404);
  });

  it('GET /:id/export?format=json returns conversation + messages snake_case', async () => {
    mockedPrisma.conversation.findFirst.mockResolvedValue(sampleRow);
    mockedPrisma.message.findMany.mockResolvedValue([
      {
        role: 'user',
        content: 'Hi',
        createdAt: new Date('2026-01-01T01:00:00.000Z'),
      },
    ]);

    const res = await request(app)
      .get('/api/conversations/5/export?format=json')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body.conversation.user_id).toBe(9);
    expect(res.body.messages[0]).toEqual({
      role: 'user',
      content: 'Hi',
      created_at: '2026-01-01T01:00:00.000Z',
    });
    expect(mockedPrisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 5 },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, createdAt: true },
    });
  });

  it('GET /:id/export?format=txt returns content payload', async () => {
    mockedPrisma.conversation.findFirst.mockResolvedValue(sampleRow);
    mockedPrisma.message.findMany.mockResolvedValue([
      { role: 'user', content: 'Hi', createdAt: new Date() },
      { role: 'assistant', content: 'Yo', createdAt: new Date() },
    ]);

    const res = await request(app)
      .get('/api/conversations/5/export?format=txt')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body.format).toBe('txt');
    expect(res.body.filename).toBe('conversation-5.txt');
    expect(res.body.content).toContain('[USER] Hi');
    expect(res.body.content).toContain('[ASSISTANT] Yo');
  });

  it('GET /:id/export md (default) returns markdown content', async () => {
    mockedPrisma.conversation.findFirst.mockResolvedValue(sampleRow);
    mockedPrisma.message.findMany.mockResolvedValue([
      { role: 'user', content: 'Hi', createdAt: new Date() },
    ]);

    const res = await request(app)
      .get('/api/conversations/5/export')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body.format).toBe('md');
    expect(res.body.filename).toBe('conversation-5.md');
    expect(res.body.content).toContain('# Hello');
    expect(res.body.content).toContain('Hi');
  });
});
