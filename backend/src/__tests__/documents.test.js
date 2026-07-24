/**
 * @file documents.test.js
 * Unit-тести для REST API маршрутів завантаження та опрацювання документів (RAG).
 * Стандарт: StandardJS / Jest / Supertest
 */

const request = require('supertest');
const app = require('../server');
const pool = require('../config/database');

// Мокаємо авторизацію та базу даних
jest.mock('../middleware/auth', () => (req, res, next) => {
  req.userId = 1;
  next();
});

jest.mock('../config/database', () => ({
  query: jest.fn()
}));

describe('Documents API Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/documents — повинен повертати список документів користувача', async () => {
    const mockDocuments = [
      { id: 1, filename: 'test.pdf', file_type: 'application/pdf', file_size: 1024, chunks_count: 3 }
    ];

    pool.query.mockResolvedValueOnce({ rows: mockDocuments });

    const res = await request(app).get('/api/documents');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual(mockDocuments);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT d.*'),
      [1]
    );
  });

  test('DELETE /api/documents/:id — повинен видаляти документ', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const res = await request(app).delete('/api/documents/1');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ success: true, message: 'Документ видалено' });
  });

  test('POST /api/documents/upload — повинен повертати 400 якщо файл не додано', async () => {
    const res = await request(app).post('/api/documents/upload');

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error', 'Будь ласка, виберіть файл для завантаження');
  });
});
