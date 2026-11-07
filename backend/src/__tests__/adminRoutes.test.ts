import express from 'express';

const request = require('supertest');

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    usageLedger: { groupBy: jest.fn() },
    invite: { create: jest.fn(), findMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../middleware/auth', () => (req: any, _res: any, next: any) => {
  req.userId = 1;
  next();
});

import prisma from '../config/prisma';
import adminRouter from '../routes/admin';

const db = prisma as any;
const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('admin routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ role: 'admin' });
  });

  it('returns 403 for a member', async () => {
    db.user.findUnique.mockResolvedValue({ role: 'member' });
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Недостатньо прав');
  });

  it('lists users for an admin', async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Ada',
        email: 'a@b.com',
        role: 'admin',
        blocked: false,
        sharedKeyDailyLimitUsd: null,
        createdAt: new Date('2026-11-07T00:00:00.000Z'),
      },
    ]);

    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.users[0]).toMatchObject({
      id: 1,
      email: 'a@b.com',
      role: 'admin',
      blocked: false,
      sharedKeyDailyLimitUsd: null,
    });
  });

  it('returns estimated spend for the day', async () => {
    db.usageLedger.groupBy.mockResolvedValue([
      {
        userId: 2,
        provider: 'openai',
        model: 'gpt-4o-mini',
        _sum: { costUsd: '0.2', promptTokens: 10, completionTokens: 4 },
      },
    ]);
    db.user.findMany.mockResolvedValue([{ id: 2, email: 'm@b.com' }]);

    const res = await request(app).get('/api/admin/spend?period=day');
    expect(res.status).toBe(200);
    expect(res.body.estimate).toBe(true);
    expect(res.body.rows[0]).toMatchObject({
      userId: 2,
      email: 'm@b.com',
      costUsd: 0.2,
    });
  });

  it('refuses to block the acting admin', async () => {
    const res = await request(app).patch('/api/admin/users/1').send({ blocked: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Не можна зняти з себе права адміністратора');
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
