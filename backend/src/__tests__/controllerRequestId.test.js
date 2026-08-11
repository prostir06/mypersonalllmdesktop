const express = require('express');
const request = require('supertest');
const requestId = require('../middleware/requestId');

jest.mock('../middleware/auth', () => (req, _res, next) => {
  req.userId = 1;
  next();
});

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    conversation: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    llmModel: { findMany: jest.fn(), create: jest.fn() },
    userSettings: { findUnique: jest.fn() },
  },
}));

const prisma = require('../config/prisma').default;

function appWithRoutes() {
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/conversations', require('../routes/conversations'));
  app.use('/api/models', require('../routes/models'));
  app.use('/api/users', require('../routes/users'));
  return app;
}

describe('controller error JSON includes requestId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('auth login validation', async () => {
    const app = appWithRoutes();
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Request-Id', 'rid-auth')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.requestId).toBe('rid-auth');
    expect(res.body.errors).toBeDefined();
  });

  it('conversations list 500', async () => {
    prisma.conversation.findMany.mockRejectedValue(new Error('db down'));
    prisma.conversation.count.mockRejectedValue(new Error('db down'));
    const app = appWithRoutes();
    const res = await request(app)
      .get('/api/conversations')
      .set('X-Request-Id', 'rid-conv');
    expect(res.status).toBe(500);
    expect(res.body.requestId).toBe('rid-conv');
    expect(res.body.error).toBeDefined();
  });

  it('users/me 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const app = appWithRoutes();
    const res = await request(app)
      .get('/api/users/me')
      .set('X-Request-Id', 'rid-user');
    expect(res.status).toBe(404);
    expect(res.body.requestId).toBe('rid-user');
  });

  it('models create validation 400', async () => {
    const app = appWithRoutes();
    const res = await request(app)
      .post('/api/models')
      .set('X-Request-Id', 'rid-model')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });
});
