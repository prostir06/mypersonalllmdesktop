const mockGetText = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: mockGetText,
    getInfo: jest.fn().mockResolvedValue({ total: 1 }),
    destroy: mockDestroy,
  })),
}));

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    document: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    documentChunk: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
  },
}));

jest.mock('../services/EmbeddingService', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(),
    generateBatchEmbeddings: jest.fn(),
  },
}));

jest.mock('../services/embeddings/resolveEmbeddingContext', () => ({
  resolveEmbeddingContext: jest.fn(),
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const mockWorkbookLoad = jest.fn().mockResolvedValue(undefined);
const mockEachSheet = jest.fn((cb: (worksheet: { name: string; eachRow: (rowCb: (row: { values: (string | number | undefined)[] }) => void) => void }) => void) => {
  cb({
    name: 'Sales',
    eachRow: (rowCb) => {
      rowCb({ values: [undefined, 'Name', 'Qty'] });
      rowCb({ values: [undefined, 'A', 1] });
    },
  });
  cb({
    name: 'Meta',
    eachRow: (rowCb) => {
      rowCb({ values: [undefined, 'Key', 'Val'] });
      rowCb({ values: [undefined, 'region', 'UA'] });
    },
  });
});
jest.mock('exceljs', () => ({
  __esModule: true,
  default: {
    Workbook: jest.fn().mockImplementation(() => ({
      xlsx: {
        load: mockWorkbookLoad,
      },
      eachSheet: mockEachSheet,
    })),
  },
  Workbook: jest.fn().mockImplementation(() => ({
    xlsx: {
      load: mockWorkbookLoad,
    },
    eachSheet: mockEachSheet,
  })),
}));

import { PDFParse } from 'pdf-parse';
import prisma from '../config/prisma';
import logger from '../logger';
import DocumentService from '../services/DocumentService';
import EmbeddingService from '../services/EmbeddingService';
import { resolveEmbeddingContext } from '../services/embeddings/resolveEmbeddingContext';
import { computeNeedsReindex } from '../services/documents/publicDocument';
import { deleteTempUpload } from '../services/documents/tempUploads';
import { DocumentQueueFullError } from '../utils/documentJobQueue';

const mockedPrisma = prisma as unknown as {
  document: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  documentChunk: {
    create: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  $executeRawUnsafe: jest.Mock;
  $transaction: jest.Mock;
};

const mockedEmbed = EmbeddingService as unknown as {
  isAvailable: jest.Mock;
  generateBatchEmbeddings: jest.Mock;
};

const mockedResolveCtx = resolveEmbeddingContext as jest.Mock;

describe('public document helpers', () => {
  it('needs reindex when provider mismatches', () => {
    expect(
      computeNeedsReindex(
        { embeddingsCount: 3, embeddingProvider: 'openai' } as any,
        'ollama'
      )
    ).toBe(true);
  });
});

describe('DocumentService (Prisma)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveCtx.mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-test',
    });
    // Default: $transaction runs callback with prisma-like tx that delegates to same mocks
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        document: mockedPrisma.document,
        documentChunk: mockedPrisma.documentChunk,
        $executeRawUnsafe: mockedPrisma.$executeRawUnsafe,
      };
      return fn(tx);
    });
  });

  describe('chunkText', () => {
    it('returns [] for empty/null', () => {
      expect(DocumentService.chunkText('')).toEqual([]);
      expect(DocumentService.chunkText(null as unknown as string)).toEqual([]);
    });

    it('returns one chunk when text shorter than chunkSize', () => {
      expect(DocumentService.chunkText('Короткий', 1000, 200)).toEqual(['Короткий']);
    });

    it('splits workbook text on sheet headers', () => {
      const text = '## Sheet: A\nrow-a\n## Sheet: B\nrow-b';
      expect(DocumentService.chunkText(text, 1500, 0)).toEqual([
        '## Sheet: A\nrow-a',
        '## Sheet: B\nrow-b',
      ]);
    });
  });

  describe('extractText', () => {
    it('returns utf-8 for text/plain', async () => {
      const text = await DocumentService.extractText(
        Buffer.from('Тест', 'utf-8'),
        'text/plain',
        't.txt'
      );
      expect(text).toBe('Тест');
    });

    it('uses pdf-parse PDFParse.getText for PDFs', async () => {
      mockGetText.mockResolvedValue({ text: 'PDF body' });

      const text = await DocumentService.extractText(
        Buffer.from('%PDF'),
        'application/pdf',
        'doc.pdf'
      );

      expect(PDFParse).toHaveBeenCalled();
      expect(mockGetText).toHaveBeenCalled();
      expect(mockDestroy).toHaveBeenCalled();
      expect(text).toBe('PDF body');
    });

    it('keeps PDF text when parser.destroy fails', async () => {
      mockGetText.mockResolvedValue({ text: 'PDF body' });
      mockDestroy.mockRejectedValueOnce(new Error('destroy boom'));

      const text = await DocumentService.extractText(
        Buffer.from('%PDF'),
        'application/pdf',
        'doc.pdf'
      );

      expect(text).toBe('PDF body');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/PDF parser destroy failed.*destroy boom/)
      );
    });

    it('logs and rethrows a public error when XLSX parse fails and preserves cause', async () => {
      const corruptErr = new Error('Corrupt zip');
      mockWorkbookLoad.mockRejectedValueOnce(corruptErr);

      let caught: any;
      try {
        await DocumentService.extractText(
          Buffer.from([0x50, 0x4b, 0x03, 0x04]),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'sales.xlsx'
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toMatch(/Excel/i);
      expect(caught.cause).toBe(corruptErr);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/XLSX extract failed.*sales\.xlsx.*Corrupt zip/)
      );
    });

    it('converts XLSX sheets to labeled CSV', async () => {
      mockWorkbookLoad.mockResolvedValueOnce(undefined);

      const text = await DocumentService.extractText(
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'sales.xlsx'
      );

      expect(text).toContain('## Sheet: Sales');
      expect(text).toContain('Name,Qty\nA,1');
      expect(text).toContain('## Sheet: Meta');
      expect(text).toContain('Key,Val\nregion,UA');
    });
  });

  describe('acceptUpload', () => {
    it('creates pending document and enqueues processing without awaiting it', async () => {
      mockedPrisma.document.create.mockResolvedValue({
        id: 42,
        userId: 1,
        filename: 'test.txt',
        fileType: 'text/plain',
        fileSize: 100,
        status: 'pending',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const queued: Array<() => void> = [];
      const result = await DocumentService.acceptUpload(
        {
          originalname: 'test.txt',
          mimetype: 'text/plain',
          size: 100,
          buffer: Buffer.from('Текст для тестування', 'utf-8'),
        },
        1,
        (job) => {
          queued.push(job);
        }
      );

      expect(result.document).toMatchObject({
        id: 42,
        status: 'pending',
        filename: 'test.txt',
      });
      expect(mockedPrisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          filename: 'test.txt',
          status: 'pending',
          stagingPath: expect.any(String),
        }),
      });
      expect(queued).toHaveLength(1);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();

      const createdStagingPath =
        mockedPrisma.document.create.mock.calls[0]?.[0]?.data?.stagingPath;
      await deleteTempUpload(createdStagingPath ?? null);
    });

    it('logs a failed rollback when the indexing queue is full', async () => {
      mockedPrisma.document.create.mockResolvedValue({
        id: 7,
        userId: 1,
        filename: 'full.txt',
        fileType: 'text/plain',
        fileSize: 4,
        status: 'pending',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockedPrisma.document.delete.mockRejectedValue(new Error('db down'));

      await expect(
        DocumentService.acceptUpload(
          {
            originalname: 'full.txt',
            mimetype: 'text/plain',
            size: 4,
            path: '/tmp/full.txt',
          },
          1,
          () => false
        )
      ).rejects.toBeInstanceOf(DocumentQueueFullError);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('db down')
      );
    });

    it('rejects files over MAX_FILE_SIZE before create', async () => {
      const prev = process.env.MAX_FILE_SIZE;
      process.env.MAX_FILE_SIZE = '5';
      try {
        await expect(
          DocumentService.acceptUpload(
            {
              originalname: 'big.txt',
              mimetype: 'text/plain',
              size: 10,
              buffer: Buffer.from('0123456789', 'utf-8'),
            },
            1,
            () => undefined
          )
        ).rejects.toThrow(/ліміт/i);
        expect(mockedPrisma.document.create).not.toHaveBeenCalled();
      } finally {
        if (prev === undefined) delete process.env.MAX_FILE_SIZE;
        else process.env.MAX_FILE_SIZE = prev;
      }
    });
  });

  describe('finalizeUpload', () => {
    it('writes chunks with embeddings and marks ready', async () => {
      mockedEmbed.isAvailable.mockReturnValue(true);
      mockedEmbed.generateBatchEmbeddings.mockResolvedValue([[0.1, 0.2]]);
      mockedPrisma.$executeRawUnsafe.mockResolvedValue(1);
      mockedPrisma.document.update.mockResolvedValue({
        id: 42,
        userId: 1,
        filename: 'test.txt',
        fileType: 'text/plain',
        fileSize: 100,
        status: 'ready',
        embeddingsCount: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await DocumentService.finalizeUpload(
        42,
        1,
        {
          originalname: 'test.txt',
          mimetype: 'text/plain',
          size: 100,
        },
        Buffer.from('Текст для тестування', 'utf-8')
      );

      expect(result.chunksCount).toBe(1);
      expect(result.document.status).toBe('ready');
      expect(mockedPrisma.$transaction).toHaveBeenCalled();
      expect(mockedPrisma.$executeRawUnsafe).toHaveBeenCalled();
      expect(mockedPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: expect.objectContaining({
          status: 'ready',
          failureReason: null,
          stagingPath: null,
          embeddingsCount: 1,
          embeddingProvider: 'openai',
        }),
      });
    });

    it('uses createMany when embeddings unavailable and marks ready', async () => {
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedPrisma.documentChunk.createMany.mockResolvedValue({ count: 1 });
      mockedPrisma.document.update.mockResolvedValue({
        id: 7,
        userId: 1,
        filename: 'a.txt',
        fileType: 'text/plain',
        fileSize: 3,
        status: 'ready',
        createdAt: new Date(),
      });

      await DocumentService.finalizeUpload(
        7,
        1,
        {
          originalname: 'a.txt',
          mimetype: 'text/plain',
          size: 3,
        },
        Buffer.from('abc', 'utf-8')
      );

      expect(mockedPrisma.documentChunk.createMany).toHaveBeenCalledWith({
        data: [{ documentId: 7, chunkIndex: 0, content: 'abc' }],
      });
      expect(mockedPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: expect.objectContaining({
          status: 'ready',
          embeddingsCount: 0,
        }),
      });
    });

    it('marks failed when extracted text empty', async () => {
      mockedPrisma.document.update.mockResolvedValue({
        id: 3,
        userId: 1,
        filename: 'empty.txt',
        fileType: 'text/plain',
        fileSize: 0,
        status: 'failed',
        createdAt: new Date(),
      });

      await expect(
        DocumentService.finalizeUpload(
          3,
          1,
          {
            originalname: 'empty.txt',
            mimetype: 'text/plain',
            size: 0,
          },
          Buffer.from('', 'utf-8')
        )
      ).rejects.toThrow(/витягти текст/i);

      expect(mockedPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: expect.objectContaining({
          status: 'failed',
          failureReason: expect.any(String),
        }),
      });
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rethrows original error when mark-failed update also fails', async () => {
      mockedPrisma.document.update.mockRejectedValue(new Error('db write failed'));

      await expect(
        DocumentService.finalizeUpload(
          3,
          1,
          {
            originalname: 'empty.txt',
            mimetype: 'text/plain',
            size: 0,
          },
          Buffer.from('', 'utf-8')
        )
      ).rejects.toThrow(/витягти текст/i);
    });
  });

  describe('reindexEmbeddings', () => {
    it('returns null when document missing or not ready', async () => {
      mockedPrisma.document.findFirst.mockResolvedValue(null);
      await expect(DocumentService.reindexEmbeddings(9, 1)).resolves.toBeNull();
    });

    it('throws when no embedding provider available', async () => {
      mockedPrisma.document.findFirst.mockResolvedValue({
        id: 1,
        userId: 1,
        status: 'ready',
      });
      mockedResolveCtx.mockResolvedValueOnce({ provider: 'none' });
      mockedEmbed.isAvailable.mockReturnValue(false);

      await expect(DocumentService.reindexEmbeddings(1, 1)).rejects.toThrow(
        /провайдера embeddings/i
      );
    });

    it('updates chunk embeddings and document metadata', async () => {
      mockedPrisma.document.findFirst
        .mockResolvedValueOnce({
          id: 5,
          userId: 1,
          status: 'ready',
          filename: 'a.txt',
          fileType: 'text/plain',
          fileSize: 3,
          embeddingsCount: 0,
          embeddingProvider: null,
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 5,
          userId: 1,
          status: 'ready',
          filename: 'a.txt',
          fileType: 'text/plain',
          fileSize: 3,
          embeddingsCount: 1,
          embeddingProvider: 'openai',
          createdAt: new Date(),
          _count: { chunks: 1 },
        });
      mockedPrisma.documentChunk.findMany.mockResolvedValue([
        { id: 10, content: 'hello' },
      ]);
      mockedEmbed.isAvailable.mockReturnValue(true);
      mockedEmbed.generateBatchEmbeddings.mockResolvedValue([[0.1, 0.2]]);
      mockedPrisma.$executeRawUnsafe.mockResolvedValue(1);
      mockedPrisma.document.update.mockResolvedValue({});

      const result = await DocumentService.reindexEmbeddings(5, 1);

      expect(result?.embeddingsCount).toBe(1);
      expect(result?.document.embedding_provider).toBe('openai');
      expect(mockedPrisma.$executeRawUnsafe).toHaveBeenCalled();
      expect(mockedPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          embeddingsCount: 1,
          embeddingProvider: 'openai',
        },
      });
    });
  });

  describe('getByUser', () => {
    it('returns paginated snake_case rows with chunks_count', async () => {
      mockedPrisma.document.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 1,
          filename: 'a.pdf',
          fileType: 'application/pdf',
          fileSize: 10,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          _count: { chunks: 5 },
        },
      ]);
      mockedPrisma.document.count.mockResolvedValue(1);

      const page = await DocumentService.getByUser(1, 10, 0);
      expect(page.items[0]).toMatchObject({
        id: 1,
        user_id: 1,
        filename: 'a.pdf',
        file_type: 'application/pdf',
        file_size: 10,
        chunks_count: 5,
      });
      expect(page).toMatchObject({ total: 1, limit: 10, offset: 0 });
      expect(mockedPrisma.document.updateMany).not.toHaveBeenCalled();
      expect(mockedPrisma.document.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 0,
        include: { _count: { select: { chunks: true } } },
      });
    });
  });

  describe('delete', () => {
    it('returns true when count > 0', async () => {
      mockedPrisma.document.findFirst.mockResolvedValue({ stagingPath: null });
      mockedPrisma.document.deleteMany.mockResolvedValue({ count: 1 });
      expect(await DocumentService.delete(1, 1)).toBe(true);
      expect(mockedPrisma.document.deleteMany).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
      });
    });

    it('returns false when count is 0', async () => {
      mockedPrisma.document.findFirst.mockResolvedValue({ stagingPath: null });
      mockedPrisma.document.deleteMany.mockResolvedValue({ count: 0 });
      expect(await DocumentService.delete(99, 1)).toBe(false);
    });
  });

  describe('retryIndexing', () => {
    it('logs the original access error when staging file is gone', async () => {
      const fs = require('fs/promises') as typeof import('fs/promises');
      mockedPrisma.document.findFirst.mockResolvedValue({
        id: 7,
        userId: 1,
        status: 'failed',
        stagingPath: '/tmp/gone.xlsx',
        filename: 'gone.xlsx',
        fileType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: 10,
      });
      const accessSpy = jest
        .spyOn(fs, 'access')
        .mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(
        DocumentService.retryIndexing(7, 1, jest.fn())
      ).rejects.toThrow(/повторної індексації/);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/staging file missing.*gone\.xlsx.*ENOENT/)
      );
      accessSpy.mockRestore();
    });
  });

  describe('mergeOrderedChunks', () => {
    it('returns empty string for empty chunks', () => {
      expect(DocumentService.mergeOrderedChunks([])).toBe('');
    });

    it('returns single chunk unchanged', () => {
      expect(DocumentService.mergeOrderedChunks(['Hello world'])).toBe('Hello world');
    });

    it('merges overlapping chunks by removing the overlap', () => {
      const c1 = '# Договір\n\nРозділ 1. Загальні умови. Додатковий текст для перекриття довжиною понад 20 символів.';
      const overlap = 'Додатковий текст для перекриття довжиною понад 20 символів.';
      const c2 = `${overlap}\n\nРозділ 2. Оплата.`;
      const merged = DocumentService.mergeOrderedChunks([c1, c2]);
      expect(merged).toBe(`${c1}\n\nРозділ 2. Оплата.`);
    });

    it('joins non-overlapping chunks with double newline', () => {
      const merged = DocumentService.mergeOrderedChunks(['Chunk 1', 'Chunk 2']);
      expect(merged).toBe('Chunk 1\n\nChunk 2');
    });
  });

  describe('getFullContent', () => {
    it('returns not_found when document does not exist', async () => {
      mockedPrisma.document.findFirst.mockResolvedValue(null);
      const res = await DocumentService.getFullContent(99, 1);
      expect(res).toEqual({ status: 'not_found' });
    });

    it('returns not_ready when document status is pending', async () => {
      mockedPrisma.document.findFirst.mockResolvedValue({
        id: 43,
        filename: 'pending.docx',
        fileType: 'text/plain',
        status: 'pending',
      });
      const res = await DocumentService.getFullContent(43, 1);
      expect(res).toEqual({ status: 'not_ready', docStatus: 'pending' });
    });

    it('reconstructs full document content from ordered chunks for ready document', async () => {
      mockedPrisma.document.findFirst.mockResolvedValue({
        id: 42,
        filename: 'contract.docx',
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        status: 'ready',
      });
      mockedPrisma.documentChunk.findMany.mockResolvedValue([
        { chunkIndex: 0, content: '# Договір\n\nРозділ 1. Загальні умови.' },
        { chunkIndex: 1, content: 'Розділ 1. Загальні умови.\n\nРозділ 2. Оплата.' },
      ]);
      const res = await DocumentService.getFullContent(42, 1);
      expect(res.status).toBe('ok');
      if (res.status === 'ok') {
        expect(res.data.id).toBe(42);
        expect(res.data.filename).toBe('contract.docx');
        expect(res.data.content).toContain('# Договір');
        expect(res.data.content).toContain('Розділ 2. Оплата.');
      }
    });
  });
});
