import express from 'express';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
import usersRouter from '../routes/users';

const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);

const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  refreshToken: {
    updateMany: jest.Mock;
  };
};

function tokenFor(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'llm-assistant', audience: 'llm-assistant-api' });
}

describe('Users API (Prisma)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /me returns snake_case profile without password', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 9,
      name: 'Ada',
      email: 'ada@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 9,
      name: 'Ada',
      email: 'ada@example.com',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).not.toHaveProperty('createdAt');
    expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 9 },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  });

  it('GET /me returns 404 when user missing', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${tokenFor(9)}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found');
  });

  it('PUT /me updates name and email when the current password matches', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Password1', 4);
    mockedPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: hash,
    });
    mockedPrisma.user.update.mockResolvedValue({
      id: 9,
      name: 'Ada Lovelace',
      email: 'ada2@example.com',
    });

    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ name: 'Ada Lovelace', email: 'ADA2@example.com', currentPassword: 'Password1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 9,
      name: 'Ada Lovelace',
      email: 'ada2@example.com',
    });
    expect(res.body).not.toHaveProperty('created_at');
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { name: 'Ada Lovelace', email: 'ada2@example.com' },
      select: { id: true, name: true, email: true },
    });
    expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('PUT /me returns 400 for empty name', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ name: '  ', email: 'ada@example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it('PUT /me returns 400 for invalid email', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ name: 'Ada', email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it('PUT /me returns 409 on Prisma P2002', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      email: 'taken@example.com',
      password: 'hash',
    });
    const err: any = new Error('Unique constraint failed');
    err.code = 'P2002';
    mockedPrisma.user.update.mockRejectedValue(err);

    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ name: 'Ada', email: 'taken@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already in use');
  });

  it('POST /me/password revokes refresh tokens', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Password1', 4);
    mockedPrisma.user.findUnique.mockResolvedValue({ password: hash });
    mockedPrisma.user.update.mockResolvedValue({ id: 9 });

    const res = await request(app)
      .post('/api/users/me/password')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ currentPassword: 'Password1', newPassword: 'Password2' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 9, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
