import express from 'express';

const request = require('supertest');

jest.mock('../middleware/auth', () => (req: any, _res: any, next: any) => {
  req.userId = 1;
  next();
});

jest.mock('../services/DocumentService', () => ({
  __esModule: true,
  default: {
    uploadAndProcess: jest.fn(),
    getByUser: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import DocumentService from '../services/DocumentService';
import documentsRouter from '../routes/documents';

const app = express();
app.use(express.json());
app.use('/api/documents', documentsRouter);

const mockedService = DocumentService as unknown as {
  uploadAndProcess: jest.Mock;
  getByUser: jest.Mock;
  delete: jest.Mock;
};

describe('Documents API (Prisma routes)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET / returns paginated documents from service', async () => {
    mockedService.getByUser.mockResolvedValue({
      items: [
        {
          id: 1,
          user_id: 1,
          filename: 'test.pdf',
          file_type: 'application/pdf',
          file_size: 1024,
          chunks_count: 3,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(200);
    expect(res.body.items[0].chunks_count).toBe(3);
    expect(res.body.total).toBe(1);
    expect(mockedService.getByUser).toHaveBeenCalledWith(1, 50, 0);
  });

  it('DELETE /:id success', async () => {
    mockedService.delete.mockResolvedValue(true);
    const res = await request(app).delete('/api/documents/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Документ успішно видалено',
    });
    expect(mockedService.delete).toHaveBeenCalledWith(1, 1);
  });

  it('DELETE /:id rejects non-digit with 400', async () => {
    const res = await request(app).delete('/api/documents/123abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Некоректний ідентифікатор документа');
    expect(mockedService.delete).not.toHaveBeenCalled();
  });

  it('DELETE /:id returns 404 when not found', async () => {
    mockedService.delete.mockResolvedValue(false);
    const res = await request(app).delete('/api/documents/9');
    expect(res.status).toBe(404);
  });

  it('POST /upload without file returns 400', async () => {
    const res = await request(app).post('/api/documents/upload');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Будь ласка, виберіть файл для завантаження');
  });

  it('POST /upload in production omits internal error details', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    mockedService.uploadAndProcess.mockRejectedValue(
      new Error('ENOENT /secret/path.pdf')
    );
    try {
      const res = await request(app)
        .post('/api/documents/upload')
        .attach('file', Buffer.from('x'), 'x.txt');
      expect(res.status).toBe(500);
      expect(res.body.error).not.toMatch(/ENOENT|secret/);
      expect(res.body.error).toMatch(/Помилка обробки файлу/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
