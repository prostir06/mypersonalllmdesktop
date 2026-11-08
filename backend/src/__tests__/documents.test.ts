import express from 'express';

const request = require('supertest');

jest.mock('../middleware/auth', () => (req: any, _res: any, next: any) => {
  req.userId = 1;
  next();
});

jest.mock('../services/DocumentService', () => ({
  __esModule: true,
  default: {
    acceptUpload: jest.fn(),
    getByUser: jest.fn(),
    getStatuses: jest.fn(),
    getById: jest.fn(),
    getChunks: jest.fn(),
    retryIndexing: jest.fn(),
    reindexEmbeddings: jest.fn(),
    delete: jest.fn(),
    getFullContent: jest.fn(),
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import DocumentService from '../services/DocumentService';
import { deleteTempUpload } from '../services/documents/tempUploads';
import documentsRouter from '../routes/documents';
import { DocumentQueueFullError } from '../utils/documentJobQueue';

const app = express();
app.use(express.json());
app.use('/api/documents', documentsRouter);

const mockedService = DocumentService as unknown as {
  acceptUpload: jest.Mock;
  getByUser: jest.Mock;
  getStatuses: jest.Mock;
  getById: jest.Mock;
  getChunks: jest.Mock;
  retryIndexing: jest.Mock;
  reindexEmbeddings: jest.Mock;
  delete: jest.Mock;
  getFullContent: jest.Mock;
};

describe('Documents API (Prisma routes)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    for (const call of mockedService.acceptUpload.mock.calls) {
      const uploadedPath = (call?.[0] as { path?: string } | undefined)?.path;
      if (uploadedPath) {
        await deleteTempUpload(uploadedPath);
      }
    }
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

  it('GET /status returns statuses for the requested ids only', async () => {
    mockedService.getStatuses.mockResolvedValue([
      { id: 4, filename: 'a.txt', status: 'ready', has_embeddings: false },
    ]);

    const res = await request(app).get('/api/documents/status?ids=4,4');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { id: 4, filename: 'a.txt', status: 'ready', has_embeddings: false },
    ]);
    expect(mockedService.getStatuses).toHaveBeenCalledWith(1, [4]);
  });

  it('GET /status rejects a malformed id list', async () => {
    const res = await request(app).get('/api/documents/status?ids=1,nope');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Некоректний список документів');
    expect(mockedService.getStatuses).not.toHaveBeenCalled();
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

  it('POST /upload returns 202 pending and schedules processing', async () => {
    mockedService.acceptUpload.mockResolvedValue({
      document: {
        id: 11,
        user_id: 1,
        filename: 'note.txt',
        file_type: 'text/plain',
        file_size: 1,
        status: 'pending',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const res = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('x'), 'note.txt');

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('pending');
    expect(res.body.document.id).toBe(11);
    expect(res.body.document.status).toBe('pending');
    expect(mockedService.acceptUpload).toHaveBeenCalled();
  });

  it('POST /upload returns 429 when the indexing queue is full', async () => {
    mockedService.acceptUpload.mockRejectedValue(new DocumentQueueFullError());
    const res = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('x'), 'note.txt');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Черга індексації переповнена — спробуйте пізніше');
  });

  it('GET /:id returns document from service', async () => {
    mockedService.getById.mockResolvedValue({
      id: 11,
      user_id: 1,
      filename: 'note.txt',
      file_type: 'text/plain',
      file_size: 1,
      status: 'ready',
      chunks_count: 2,
      created_at: '2026-01-01T00:00:00.000Z',
    });

    const res = await request(app).get('/api/documents/11');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(mockedService.getById).toHaveBeenCalledWith(11, 1);
  });

  it('GET /:id returns 404 when missing', async () => {
    mockedService.getById.mockResolvedValue(null);
    const res = await request(app).get('/api/documents/99');
    expect(res.status).toBe(404);
  });

  it('GET /:id/chunks returns paginated chunks', async () => {
    mockedService.getChunks.mockResolvedValue({
      items: [{ chunk_index: 0, content: 'hello' }],
      total: 1,
      limit: 5,
      offset: 0,
    });

    const res = await request(app).get('/api/documents/11/chunks');
    expect(res.status).toBe(200);
    expect(res.body.items[0].content).toBe('hello');
    expect(mockedService.getChunks).toHaveBeenCalledWith(11, 1, 5, 0);
  });

  it('GET /:id/chunks returns 404 when missing', async () => {
    mockedService.getChunks.mockResolvedValue(null);
    const res = await request(app).get('/api/documents/99/chunks');
    expect(res.status).toBe(404);
  });

  it('POST /:id/retry returns 202 pending', async () => {
    mockedService.retryIndexing.mockResolvedValue({
      document: {
        id: 11,
        user_id: 1,
        filename: 'note.txt',
        status: 'pending',
      },
    });

    const res = await request(app).post('/api/documents/11/retry');
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('pending');
    expect(mockedService.retryIndexing).toHaveBeenCalledWith(11, 1);
  });

  it('POST /:id/retry returns 409 when staging file gone', async () => {
    mockedService.retryIndexing.mockRejectedValue(
      new Error('Файл недоступний для повторної індексації — завантажте документ знову')
    );
    const res = await request(app).post('/api/documents/11/retry');
    expect(res.status).toBe(409);
  });

  it('POST /:id/reindex returns updated document', async () => {
    mockedService.reindexEmbeddings.mockResolvedValue({
      document: {
        id: 11,
        user_id: 1,
        filename: 'note.txt',
        status: 'ready',
        embeddings_count: 2,
        embedding_provider: 'ollama',
        needs_reindex: false,
      },
      embeddingsCount: 2,
    });

    const res = await request(app).post('/api/documents/11/reindex');
    expect(res.status).toBe(200);
    expect(res.body.embeddings_count).toBe(2);
    expect(mockedService.reindexEmbeddings).toHaveBeenCalledWith(11, 1);
  });

  it('POST /:id/reindex returns 409 when no provider', async () => {
    mockedService.reindexEmbeddings.mockRejectedValue(
      new Error('Немає доступного провайдера embeddings')
    );
    const res = await request(app).post('/api/documents/11/reindex');
    expect(res.status).toBe(409);
  });

  it('POST /:id/reindex returns 500 for unexpected errors', async () => {
    mockedService.reindexEmbeddings.mockRejectedValue(
      new Error('connection reset while writing embeddings')
    );
    const res = await request(app).post('/api/documents/11/reindex');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/переіндексувати/i);
  });

  it('POST /upload in production omits internal error details', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    mockedService.acceptUpload.mockRejectedValue(
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

  it('POST /upload in non-production includes internal error details', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    mockedService.acceptUpload.mockRejectedValue(
      new Error('ENOENT /secret/path.pdf')
    );
    try {
      const res = await request(app)
        .post('/api/documents/upload')
        .attach('file', Buffer.from('x'), 'x.txt');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/ENOENT \/secret\/path\.pdf/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('POST /upload rejects unsupported file type', async () => {
    const res = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('hello'), {
        filename: 'test.exe',
        contentType: 'application/octet-stream',
      });
    // Multer fileFilter error may surface as 400 or 500 depending on error handler
    expect([400, 500]).toContain(res.status);
    expect(mockedService.acceptUpload).not.toHaveBeenCalled();
  });

  it('POST /reindex returns 404 for non-existent document', async () => {
    mockedService.reindexEmbeddings.mockResolvedValue(null);
    const res = await request(app).post('/api/documents/999/reindex');
    expect(res.status).toBe(404);
  });

  it('POST /reindex returns 409 when no provider available', async () => {
    mockedService.reindexEmbeddings.mockRejectedValue(
      new Error('Немає доступного провайдера embeddings')
    );
    const res = await request(app).post('/api/documents/1/reindex');
    expect(res.status).toBe(409);
  });

  describe('GET /api/documents/:id/content', () => {
    it('returns 200 and reconstructs full document content from service for ready document', async () => {
      mockedService.getFullContent.mockResolvedValueOnce({
        status: 'ok',
        data: {
          id: 42,
          filename: 'contract.docx',
          file_type:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          content: '# Договір\n\nРозділ 1. Загальні умови.\n\nРозділ 2. Оплата.',
        },
      });

      const res = await request(app).get('/api/documents/42/content');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 42,
        filename: 'contract.docx',
      });
      expect(res.body.content).toContain('# Договір');
      expect(res.body.content).toContain('Розділ 2. Оплата.');
      expect(mockedService.getFullContent).toHaveBeenCalledWith(42, 1);
    });

    it('returns 409 when document is still pending or failed', async () => {
      mockedService.getFullContent.mockResolvedValueOnce({
        status: 'not_ready',
        docStatus: 'pending',
      });

      const res = await request(app).get('/api/documents/43/content');

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Документ ще обробляється або пошкоджений');
    });

    it('returns 404 when document is not found', async () => {
      mockedService.getFullContent.mockResolvedValueOnce({
        status: 'not_found',
      });

      const res = await request(app).get('/api/documents/99/content');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Документ не знайдено');
    });

    it('returns 400 for invalid document id', async () => {
      const res = await request(app).get('/api/documents/invalid/content');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Некоректний ідентифікатор документа');
    });
  });
});
