import express from 'express';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../services/userMemoryService', () => {
  const actual = jest.requireActual('../services/userMemoryService');
  return {
    ...actual,
    listNotes: jest.fn(),
    createNote: jest.fn(),
    updateNote: jest.fn(),
    deleteNote: jest.fn(),
  };
});

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

import usersRouter from '../routes/users';
import * as userMemoryService from '../services/userMemoryService';

const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);

const mocked = userMemoryService as unknown as {
  listNotes: jest.Mock;
  createNote: jest.Mock;
  updateNote: jest.Mock;
  deleteNote: jest.Mock;
};

function tokenFor(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
}

describe('User memory API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /me/memory-notes returns notes', async () => {
    mocked.listNotes.mockResolvedValue([
      {
        id: 1,
        userId: 5,
        content: 'hello',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const res = await request(app)
      .get('/api/users/me/memory-notes')
      .set('Authorization', `Bearer ${tokenFor(5)}`);

    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0]).toMatchObject({
      id: 1,
      content: 'hello',
      user_id: 5,
    });
  });

  it('POST creates note', async () => {
    mocked.createNote.mockResolvedValue({
      id: 2,
      userId: 5,
      content: 'note',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const res = await request(app)
      .post('/api/users/me/memory-notes')
      .set('Authorization', `Bearer ${tokenFor(5)}`)
      .send({ content: 'note' });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe('note');
    expect(mocked.createNote).toHaveBeenCalledWith(5, 'note');
  });

  it('DELETE returns 204', async () => {
    mocked.deleteNote.mockResolvedValue(undefined);
    const res = await request(app)
      .delete('/api/users/me/memory-notes/2')
      .set('Authorization', `Bearer ${tokenFor(5)}`);
    expect(res.status).toBe(204);
  });
});
