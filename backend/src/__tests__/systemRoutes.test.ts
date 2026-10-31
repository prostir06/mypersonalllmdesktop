process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-at-least-32-chars-long!!';

const request = require('supertest');
import jwt from 'jsonwebtoken';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

jest.mock('../services/systemKnowledge', () => ({
  __esModule: true,
  getSystemKnowledgeForUser: jest.fn(),
}));

import app from '../server';
import { getSystemKnowledgeForUser } from '../services/systemKnowledge';

const mockGetSystemKnowledgeForUser = getSystemKnowledgeForUser as jest.MockedFunction<
  typeof getSystemKnowledgeForUser
>;

function createValidToken(userId = 42): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET as string, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

describe('GET /api/system/knowledge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/api/system/knowledge');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'No token, authorization denied');
  });

  it('returns 401 when Authorization token is invalid', async () => {
    const res = await request(app)
      .get('/api/system/knowledge')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Token is not valid');
  });

  it('returns 200 with SystemKnowledgeResponse when authenticated', async () => {
    const mockPayload: any = {
      versionHash: 'abc12345',
      generatedAt: '2026-10-31T12:00:00.000Z',
      snapshot: {
        timestamp: '2026-10-31T12:00:00.000Z',
        activeProvider: 'ollama',
        activeModel: 'llama3:latest',
        ragMode: 'hybrid',
        documentCount: 5,
        pinnedPromptsCount: 1,
        memoryNotesCount: 2,
        configuredProviders: ['ollama'],
        webSearchAvailable: true,
        visionSupported: false,
        warnings: [],
      },
      advisories: [],
      cards: [],
    };

    mockGetSystemKnowledgeForUser.mockResolvedValueOnce(mockPayload);

    const res = await request(app)
      .get('/api/system/knowledge')
      .set('Authorization', `Bearer ${createValidToken(42)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockPayload);
    expect(mockGetSystemKnowledgeForUser).toHaveBeenCalledWith(42, {
      provider: undefined,
      model: undefined,
      selectedDocCount: undefined,
      webSearchEnabled: undefined,
    });
  });

  it('parses valid query parameter overrides correctly', async () => {
    mockGetSystemKnowledgeForUser.mockResolvedValueOnce({
      versionHash: 'def67890',
      generatedAt: '2026-10-31T12:00:00.000Z',
      snapshot: {} as any,
      advisories: [],
      cards: [],
    });

    const res = await request(app)
      .get('/api/system/knowledge?provider=openai&model=gpt-4o&selectedDocCount=3&webSearchEnabled=true')
      .set('Authorization', `Bearer ${createValidToken(7)}`);

    expect(res.status).toBe(200);
    expect(mockGetSystemKnowledgeForUser).toHaveBeenCalledWith(7, {
      provider: 'openai',
      model: 'gpt-4o',
      selectedDocCount: 3,
      webSearchEnabled: true,
    });
  });

  it('handles trimmed values, zero counts, and boolean false for query params', async () => {
    mockGetSystemKnowledgeForUser.mockResolvedValueOnce({
      versionHash: 'def67890',
      generatedAt: '2026-10-31T12:00:00.000Z',
      snapshot: {} as any,
      advisories: [],
      cards: [],
    });

    const res = await request(app)
      .get('/api/system/knowledge?provider=%20gemini%20&model=%20gemini-1.5-pro%20&selectedDocCount=0&webSearchEnabled=false')
      .set('Authorization', `Bearer ${createValidToken(99)}`);

    expect(res.status).toBe(200);
    expect(mockGetSystemKnowledgeForUser).toHaveBeenCalledWith(99, {
      provider: 'gemini',
      model: 'gemini-1.5-pro',
      selectedDocCount: 0,
      webSearchEnabled: false,
    });
  });

  it('ignores invalid query parameters (empty strings, negative numbers, non-boolean webSearchEnabled)', async () => {
    mockGetSystemKnowledgeForUser.mockResolvedValueOnce({
      versionHash: 'def67890',
      generatedAt: '2026-10-31T12:00:00.000Z',
      snapshot: {} as any,
      advisories: [],
      cards: [],
    });

    const res = await request(app)
      .get('/api/system/knowledge?provider=%20%20&model=&selectedDocCount=-5&webSearchEnabled=maybe')
      .set('Authorization', `Bearer ${createValidToken(12)}`);

    expect(res.status).toBe(200);
    expect(mockGetSystemKnowledgeForUser).toHaveBeenCalledWith(12, {
      provider: undefined,
      model: undefined,
      selectedDocCount: undefined,
      webSearchEnabled: undefined,
    });
  });

  it('forwards service errors to error handling middleware', async () => {
    mockGetSystemKnowledgeForUser.mockRejectedValueOnce(
      new Error('Database unavailable')
    );

    const res = await request(app)
      .get('/api/system/knowledge')
      .set('Authorization', `Bearer ${createValidToken(42)}`);

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});
