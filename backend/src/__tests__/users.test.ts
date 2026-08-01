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
  },
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
};

function tokenFor(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
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
      select: { id: true, name: true, email: true, createdAt: true },
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

  it('PUT /me updates name and email', async () => {
    mockedPrisma.user.update.mockResolvedValue({
      id: 9,
      name: 'Ada Lovelace',
      email: 'ada2@example.com',
    });

    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ name: 'Ada Lovelace', email: 'ada2@example.com' });

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
  });

  it('PUT /me returns 400 for empty name', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ name: '  ', email: 'ada@example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it('PUT /me returns 400 for invalid email', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${tokenFor(9)}`)
      .send({ name: 'Ada', email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it('PUT /me returns 409 on Prisma P2002', async () => {
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
});
