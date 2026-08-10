const mockGetText = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: mockGetText,
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
  isAvailable: jest.fn(),
  generateBatchEmbeddings: jest.fn(),
}));

jest.mock('../services/embeddings/resolveEmbeddingContext', () => ({
  resolveEmbeddingContext: jest.fn(),
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import { PDFParse } from 'pdf-parse';
import prisma from '../config/prisma';
import DocumentService from '../services/DocumentService';
import EmbeddingService from '../services/EmbeddingService';
import { resolveEmbeddingContext } from '../services/embeddings/resolveEmbeddingContext';

const mockedPrisma = prisma as unknown as {
  document: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
    count: jest.Mock;
  };
  documentChunk: { create: jest.Mock; createMany: jest.Mock };
  $executeRawUnsafe: jest.Mock;
  $transaction: jest.Mock;
};

const mockedEmbed = EmbeddingService as unknown as {
  isAvailable: jest.Mock;
  generateBatchEmbeddings: jest.Mock;
};

const mockedResolveCtx = resolveEmbeddingContext as jest.Mock;

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
});
