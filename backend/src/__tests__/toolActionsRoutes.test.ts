import express from 'express';

const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock_db';

const mockPrisma = {
  pendingToolAction: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  message: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userMemoryNote: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import chatRouter from '../routes/chat';

const app = express();
app.use(express.json());
app.use('/api/chat', chatRouter);

function tokenFor(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

describe('Tool Actions Routes (/api/chat/tool-actions)', () => {
  const user1Token = tokenFor(1);
  const user2Token = tokenFor(2);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/chat/tool-actions/:id/approve', () => {
    it('succeeds for action owner (200 OK), executes tool, and updates DB', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'act-101',
        userId: 1,
        conversationId: 5,
        messageId: 50,
        toolName: 'add_user_memory_note',
        toolArgs: { content: 'Нотатка для тесту' },
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockPrisma.pendingToolAction.update.mockResolvedValue({
        id: 'act-101',
        status: 'approved',
      });

      mockPrisma.message.findUnique.mockResolvedValue({
        id: 50,
        toolTrace: [
          {
            tool: 'add_user_memory_note',
            pendingActionId: 'act-101',
            status: 'pending_confirmation',
          },
        ],
      });

      mockPrisma.userMemoryNote.findMany.mockResolvedValue([]);
      mockPrisma.userMemoryNote.create.mockResolvedValue({
        id: 77,
        userId: 1,
        content: 'Нотатка для тесту',
      });

      const res = await request(app)
        .post('/api/chat/tool-actions/act-101/approve')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        status: 'approved',
        result: expect.objectContaining({ id: 77 }),
      });

      expect(mockPrisma.pendingToolAction.update).toHaveBeenCalledWith({
        where: { id: 'act-101' },
        data: expect.objectContaining({
          status: 'approved',
        }),
      });

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: 50 },
        data: {
          toolTrace: [
            expect.objectContaining({
              pendingActionId: 'act-101',
              status: 'completed',
            }),
          ],
        },
      });
    });

    it('returns 400 Bad Request when toolArgs is corrupted JSON', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'act-bad-args',
        userId: 1,
        conversationId: 5,
        messageId: 50,
        toolName: 'add_user_memory_note',
        toolArgs: 'corrupted json',
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const res = await request(app)
        .post('/api/chat/tool-actions/act-bad-args/approve')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: 'Invalid tool arguments format',
      });
    });

    it('returns 403 Forbidden when requested by non-owner', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'act-101',
        userId: 1, // owned by user 1
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const res = await request(app)
        .post('/api/chat/tool-actions/act-101/approve')
        .set('Authorization', `Bearer ${user2Token}`); // requested by user 2

      expect(res.status).toBe(403);
    });

    it('returns 410 Gone and marks status expired when action has expired', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'act-expired',
        userId: 1,
        status: 'pending',
        expiresAt: new Date(Date.now() - 5000), // expired 5 seconds ago
      });

      mockPrisma.pendingToolAction.update.mockResolvedValue({
        id: 'act-expired',
        status: 'expired',
      });

      const res = await request(app)
        .post('/api/chat/tool-actions/act-expired/approve')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(410);
      expect(mockPrisma.pendingToolAction.update).toHaveBeenCalledWith({
        where: { id: 'act-expired' },
        data: { status: 'expired' },
      });
    });

    it('returns 409 Conflict when action is already resolved (approved or rejected)', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'act-already-approved',
        userId: 1,
        status: 'approved',
        expiresAt: new Date(Date.now() + 10000),
      });

      const res = await request(app)
        .post('/api/chat/tool-actions/act-already-approved/approve')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(409);
    });

    it('returns 404 Not Found when action does not exist', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/chat/tool-actions/non-existent-action/approve')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 Unauthorized without auth token', async () => {
      const res = await request(app).post('/api/chat/tool-actions/act-101/approve');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/chat/tool-actions/:id/reject', () => {
    it('marks action as rejected (200 OK) for owner and updates message tool_trace', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'act-reject-me',
        userId: 1,
        conversationId: 5,
        messageId: 52,
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      mockPrisma.pendingToolAction.update.mockResolvedValue({
        id: 'act-reject-me',
        status: 'rejected',
      });

      mockPrisma.message.findUnique.mockResolvedValue({
        id: 52,
        toolTrace: [
          {
            tool: 'add_user_memory_note',
            pendingActionId: 'act-reject-me',
            status: 'pending_confirmation',
          },
        ],
      });

      const res = await request(app)
        .post('/api/chat/tool-actions/act-reject-me/reject')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, status: 'rejected' });

      expect(mockPrisma.pendingToolAction.update).toHaveBeenCalledWith({
        where: { id: 'act-reject-me' },
        data: expect.objectContaining({
          status: 'rejected',
        }),
      });

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: 52 },
        data: {
          toolTrace: [
            expect.objectContaining({
              pendingActionId: 'act-reject-me',
              status: 'rejected',
            }),
          ],
        },
      });
    });

    it('returns 403 Forbidden when non-owner attempts to reject', async () => {
      mockPrisma.pendingToolAction.findUnique.mockResolvedValue({
        id: 'act-reject-me',
        userId: 1,
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const res = await request(app)
        .post('/api/chat/tool-actions/act-reject-me/reject')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
    });
  });
});
