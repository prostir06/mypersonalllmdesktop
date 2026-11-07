/**
 * Health-check: required fields. Without DB, CI may return DEGRADED (503).
 */
const request = require('supertest');

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-at-least-32-chars-long!!';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

import app from '../server';

describe('API Integration & Health Tests', () => {
  it('trusts one proxy hop so req.ip comes from X-Forwarded-For', () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  it('GET /api/health should return health response with required fields', async () => {
    const res = await request(app).get('/api/health');

    expect([200, 503]).toContain(res.statusCode);

    expect(res.body).toEqual({
      status: 'OK',
      db: 'ok',
    });
    expect(res.body).not.toHaveProperty('memory');
  });

  it('GET /api/health/details requires a token and returns the full payload', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET, {
      expiresIn: '1h',
      issuer: 'llm-assistant',
      audience: 'llm-assistant-api',
    });
    const res = await request(app)
      .get('/api/health/details')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('memory');
    expect(res.body).toHaveProperty('database');
    expect(res.body.db).toBe('ok');
  });

  it('GET /api/unknown-endpoint should return 404', async () => {
    const res = await request(app).get('/api/unknown-endpoint');
    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty('error', 'Endpoint not found');
    expect(res.body).toHaveProperty('requestId');
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });
});
