/**
 * Health-check: required fields. Without DB, CI may return DEGRADED (503).
 */
const request = require('supertest');

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

import app = require('../server');

describe('API Integration & Health Tests', () => {
  it('GET /api/health should return health response with required fields', async () => {
    const res = await request(app).get('/api/health');

    expect([200, 503]).toContain(res.statusCode);

    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('database');
    expect(res.body).toHaveProperty('memory');
    expect(res.body).toHaveProperty('uptime');
    expect(['OK', 'DEGRADED']).toContain(res.body.status);
  });

  it('GET /api/unknown-endpoint should return 404', async () => {
    const res = await request(app).get('/api/unknown-endpoint');
    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty('error', 'Endpoint not found');
    expect(res.body).toHaveProperty('requestId');
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });
});
