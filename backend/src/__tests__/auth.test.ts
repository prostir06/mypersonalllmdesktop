import express from 'express';
const cookieParser = require('cookie-parser');
const request = require('supertest');
const crypto = require('crypto');

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';
process.env.JWT_ACCESS_EXPIRE = '15m';
process.env.JWT_REFRESH_EXPIRE = '30d';

import prisma from '../config/prisma';
import authRouter from '../routes/auth';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};

function hashToken(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

describe('Auth API (Prisma)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.refreshToken.create.mockResolvedValue({ id: 1 });
  });

  it('POST /register creates user, returns access token, sets refresh cookie', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);
    mockedPrisma.user.create.mockResolvedValue({ id: 42 });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'Password1', name: 'Ada' });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(42);
    expect(typeof res.body.token).toBe('string');
    expect(res.headers['set-cookie']?.join(';')).toMatch(/refresh_token=/);
    expect(mockedPrisma.refreshToken.create).toHaveBeenCalled();
  });

  it('POST /register returns 403 when registration is disabled', async () => {
    const prev = process.env.ALLOW_REGISTRATION;
    process.env.ALLOW_REGISTRATION = 'false';
    try {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'a@b.com', password: 'Password1', name: 'Ada' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/реєстрац/i);
      expect(mockedPrisma.user.create).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.ALLOW_REGISTRATION;
      else process.env.ALLOW_REGISTRATION = prev;
    }
  });

  it('POST /login returns 400 for unknown user without leaking existence', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'none@b.com', password: 'Password1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Невірний email або пароль');
  });

  it('POST /login returns token and refresh cookie for valid credentials', async () => {
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
    expect(res.headers['set-cookie']?.join(';')).toMatch(/refresh_token=/);
  });

  it('POST /refresh rotates cookie and returns new access token', async () => {
    const raw = 'test-refresh-raw-token-value';
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 9,
      userId: 7,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    mockedPrisma.refreshToken.update.mockResolvedValue({});
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 7 });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refresh_token=${raw}`]);

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(mockedPrisma.refreshToken.update).toHaveBeenCalled();
    expect(mockedPrisma.refreshToken.create).toHaveBeenCalled();
    expect(res.headers['set-cookie']?.join(';')).toMatch(/refresh_token=/);
  });

  it('POST /refresh returns 401 without cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(mockedPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it('POST /refresh returns 401 for revoked token', async () => {
    const raw = 'revoked-token';
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refresh_token=${raw}`]);

    expect(res.status).toBe(401);
  });

  it('POST /logout revokes and clears cookie', async () => {
    const raw = 'logout-token';
    mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [`refresh_token=${raw}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(res.headers['set-cookie']?.join(';')).toMatch(/refresh_token=;/);
  });

  describe('JWT_SECRET required', () => {
    const original = process.env.JWT_SECRET;

    afterEach(() => {
      process.env.JWT_SECRET = original;
    });

    it('register returns 500 when JWT_SECRET missing', async () => {
      delete process.env.JWT_SECRET;
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      mockedPrisma.user.create.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'x@y.com', password: 'Password1', name: 'Xena' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Помилка конфігурації сервера');
    });

    it('login returns 500 when JWT_SECRET missing', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('Password1', 4);
      delete process.env.JWT_SECRET;
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: 7,
        email: 'a@b.com',
        password: hash,
        name: 'Ada',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'a@b.com', password: 'Password1' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Помилка конфігурації сервера');
    });

    it('refresh returns 500 when JWT_SECRET missing', async () => {
      delete process.env.JWT_SECRET;
      const raw = 'any';
      mockedPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${raw}`]);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Помилка конфігурації сервера');
    });
  });
});
