/**
 * @file __tests__/health.test.js
 * Інтеграційні тести для API ендпоінтів.
 * Health-check перевіряє наявність стандартних полів у відповіді.
 * В CI без БД сервер повертає DEGRADED (503), але структуру ми перевіряємо.
 */

const request = require('supertest');

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn()
    }
  },
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn()
    }
  }
}));

const app = require('../server');

describe('API Integration & Health Tests', () => {
  it('GET /api/health should return health response with required fields', async () => {
    const res = await request(app).get('/api/health');

    // У тестовому середовищі без БД очікуємо 200 або 503
    expect([200, 503]).toContain(res.statusCode);

    // Перевіряємо наявність обов'язкових полів
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
  });
});
