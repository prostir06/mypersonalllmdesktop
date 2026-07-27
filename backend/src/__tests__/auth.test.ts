import express from 'express';

const request = require('supertest');

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';
process.env.JWT_EXPIRE = '1h';

import prisma from '../config/prisma';
import authRouter from '../routes/auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
};

describe('Auth API (Prisma)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /register creates user and returns token', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);
    mockedPrisma.user.create.mockResolvedValue({ id: 42 });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'Password1', name: 'Ada' });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(42);
    expect(typeof res.body.token).toBe('string');
    expect(mockedPrisma.user.create).toHaveBeenCalled();
  });

  it('POST /login returns 400 for unknown user without leaking existence', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'none@b.com', password: 'Password1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Невірний email або пароль');
  });

  it('POST /login returns token for valid credentials', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Password1', 4);
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'a@b.com',
      password: hash,
      name: 'Ada',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'Password1' });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(7);
    expect(typeof res.body.token).toBe('string');
  });

  it('POST /refresh returns new token for existing user', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: 7 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 7 });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });
});
