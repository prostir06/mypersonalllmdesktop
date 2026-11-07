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
      count: jest.fn(),
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
      count: jest.fn(),
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
import * as ConversationsService from '../services/conversationsService';

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
    count: jest.Mock;
  };
  message: {
    findMany: jest.Mock;
  };
};

function tokenFor(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
}

const sampleRow = {
  id: 5,
  userId: 9,
  title: 'Hello',
  isPinned: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('Conversations API (Prisma)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET / returns paginated list snake_case ordered via Prisma findMany', async () => {
    mockedPrisma.conversation.findMany.mockResolvedValue([sampleRow]);
    mockedPrisma.conversation.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/conversations?limit=10&offset=0')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          id: 5,
          title: 'Hello',
          created_at: sampleRow.createdAt.toISOString(),
          updated_at: sampleRow.updatedAt.toISOString(),
          is_pinned: false,
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
    expect(res.body.items[0]).not.toHaveProperty('userId');
    expect(mockedPrisma.conversation.findMany).toHaveBeenCalledWith({
      where: { userId: 9 },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
      skip: 0,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        isPinned: true,
      },
    });
    expect(mockedPrisma.conversation.count).toHaveBeenCalledWith({
      where: { userId: 9 },
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

  it('listForUser orders pinned conversations before unpinned conversations', async () => {
    mockedPrisma.conversation.findMany.mockResolvedValue([
      { ...sampleRow, id: 1, isPinned: true },
      { ...sampleRow, id: 2, isPinned: false },
    ]);
    mockedPrisma.conversation.count.mockResolvedValue(2);

    const result = await ConversationsService.listForUser(9, 10, 0);

    expect(mockedPrisma.conversation.findMany).toHaveBeenCalledWith({
      where: { userId: 9 },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
      skip: 0,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        isPinned: true,
      },
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].isPinned).toBe(true);
    expect(result.rows[1].isPinned).toBe(false);
  });

  it('togglePinForUser toggles isPinned from false to true and true to false', async () => {
    mockedPrisma.conversation.findFirst.mockResolvedValueOnce({
      ...sampleRow,
      id: 5,
      isPinned: false,
    });
    mockedPrisma.conversation.update.mockResolvedValueOnce({
      ...sampleRow,
      id: 5,
      isPinned: true,
    });

    const res1 = await ConversationsService.togglePinForUser(9, 5);
    expect(mockedPrisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { id: 5, userId: 9 },
    });
    expect(mockedPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isPinned: true },
    });
    expect(res1?.isPinned).toBe(true);

    mockedPrisma.conversation.findFirst.mockResolvedValueOnce({
      ...sampleRow,
      id: 5,
      isPinned: true,
    });
    mockedPrisma.conversation.update.mockResolvedValueOnce({
      ...sampleRow,
      id: 5,
      isPinned: false,
    });

    const res2 = await ConversationsService.togglePinForUser(9, 5);
    expect(mockedPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isPinned: false },
    });
    expect(res2?.isPinned).toBe(false);

    mockedPrisma.conversation.findFirst.mockResolvedValueOnce({
      ...sampleRow,
      id: 5,
      isPinned: false,
    });
    mockedPrisma.conversation.update.mockResolvedValueOnce({
      ...sampleRow,
      id: 5,
      isPinned: true,
    });

    const res3 = await ConversationsService.togglePinForUser(9, 5, true);
    expect(mockedPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isPinned: true },
    });
    expect(res3?.isPinned).toBe(true);

    mockedPrisma.conversation.findFirst.mockResolvedValueOnce(null);
    const resNull = await ConversationsService.togglePinForUser(9, 999);
    expect(resNull).toBeNull();
  });

  it('PATCH /api/conversations/:conversationId/pin updates pin status and returns updated item', async () => {
    mockedPrisma.conversation.findFirst.mockResolvedValueOnce({
      ...sampleRow,
      id: 5,
      isPinned: false,
    });
    mockedPrisma.conversation.update.mockResolvedValueOnce({
      ...sampleRow,
      id: 5,
      isPinned: true,
    });

    const res = await request(app)
      .patch('/api/conversations/5/pin')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ is_pinned: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 5,
      title: 'Hello',
      created_at: sampleRow.createdAt.toISOString(),
      updated_at: sampleRow.updatedAt.toISOString(),
      is_pinned: true,
    });

    const resInvalidId = await request(app)
      .patch('/api/conversations/xyz/pin')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send();
    expect(resInvalidId.status).toBe(404);

    mockedPrisma.conversation.findFirst.mockResolvedValueOnce(null);
    const resNotFound = await request(app)
      .patch('/api/conversations/99/pin')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send();
    expect(resNotFound.status).toBe(404);
  });
});
