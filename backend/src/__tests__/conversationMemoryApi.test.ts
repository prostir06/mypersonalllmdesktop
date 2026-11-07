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
      count: jest.fn(),
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
      count: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../services/conversationMemoryService', () => {
  const actual = jest.requireActual('../services/conversationMemoryService');
  return {
    ...actual,
    getMemory: jest.fn(),
    createNote: jest.fn(),
    updateNote: jest.fn(),
    deleteNote: jest.fn(),
    maybeRefreshSummary: jest.fn(),
  };
});

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

import conversationsRouter from '../routes/conversations';
import * as memoryService from '../services/conversationMemoryService';

const app = express();
app.use(express.json());
app.use('/api/conversations', conversationsRouter);

const mockedMemoryService = memoryService as unknown as {
  getMemory: jest.Mock;
  createNote: jest.Mock;
  updateNote: jest.Mock;
  deleteNote: jest.Mock;
  maybeRefreshSummary: jest.Mock;
};

function tokenFor(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
}

describe('Conversation memory API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /:conversationId/memory returns 401 without token', async () => {
    const res = await request(app).get('/api/conversations/7/memory');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('No token, authorization denied');
  });

  it('GET /:conversationId/memory returns 404 for wrong owner conversation', async () => {
    mockedMemoryService.getMemory.mockRejectedValue(new memoryService.MemoryError(404, 'Conversation not found'));

    const res = await request(app)
      .get('/api/conversations/7/memory')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Conversation not found');
  });

  it('GET /:conversationId/memory returns summary and notes', async () => {
    mockedMemoryService.getMemory.mockResolvedValue({
      summary: 'short summary',
      summaryUpdatedAt: new Date('2026-01-02T00:00:00.000Z'),
      notes: [
        {
          id: 5,
          conversationId: 7,
          content: 'remember this',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        },
      ],
    });

    const res = await request(app)
      .get('/api/conversations/7/memory')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      summary: 'short summary',
      summary_updated_at: '2026-01-02T00:00:00.000Z',
      notes: [
        {
          id: 5,
          conversation_id: 7,
          content: 'remember this',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:01.000Z',
        },
      ],
    });
  });

  it('POST /:conversationId/memory-notes creates note', async () => {
    mockedMemoryService.createNote.mockResolvedValue({
      id: 6,
      conversationId: 7,
      content: 'new note',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const res = await request(app)
      .post('/api/conversations/7/memory-notes')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ content: 'new note' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 6,
      conversation_id: 7,
      content: 'new note',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('POST /:conversationId/memory-notes maps 409 max notes error', async () => {
    mockedMemoryService.createNote.mockRejectedValue(new memoryService.MemoryError(409, 'Max 20 notes reached'));

    const res = await request(app)
      .post('/api/conversations/7/memory-notes')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ content: 'new note' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Max 20 notes reached');
  });

  it('PATCH /:conversationId/memory-notes/:noteId updates note', async () => {
    mockedMemoryService.updateNote.mockResolvedValue({
      id: 5,
      conversationId: 7,
      content: 'updated',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:02.000Z'),
    });

    const res = await request(app)
      .patch('/api/conversations/7/memory-notes/5')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ content: 'updated' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 5,
      conversation_id: 7,
      content: 'updated',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:02.000Z',
    });
  });

  it('DELETE /:conversationId/memory-notes/:noteId deletes note', async () => {
    mockedMemoryService.deleteNote.mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/conversations/7/memory-notes/5')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('POST /:conversationId/memory/refresh-summary triggers force summary', async () => {
    mockedMemoryService.maybeRefreshSummary.mockResolvedValue({ refreshed: true });

    const res = await request(app)
      .post('/api/conversations/7/memory/refresh-summary')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, refreshed: true });
    expect(mockedMemoryService.maybeRefreshSummary).toHaveBeenCalledWith(9, 7, {
      force: true,
    });
  });

  it('POST /:conversationId/memory/refresh-summary returns 404 for missing conversation', async () => {
    mockedMemoryService.maybeRefreshSummary.mockRejectedValue(
      new memoryService.MemoryError(404, 'Conversation not found')
    );

    const res = await request(app)
      .post('/api/conversations/7/memory/refresh-summary')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Conversation not found');
  });
});
