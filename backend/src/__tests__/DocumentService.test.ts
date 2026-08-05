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
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    documentChunk: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
  },
}));

jest.mock('../services/EmbeddingService', () => ({
  isAvailable: jest.fn(),
  generateBatchEmbeddings: jest.fn(),
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

const mockedPrisma = prisma as unknown as {
  document: {
    create: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  documentChunk: { create: jest.Mock; createMany: jest.Mock };
  $executeRawUnsafe: jest.Mock;
  $transaction: jest.Mock;
};

const mockedEmbed = EmbeddingService as unknown as {
  isAvailable: jest.Mock;
  generateBatchEmbeddings: jest.Mock;
};

describe('DocumentService (Prisma)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('uploadAndProcess', () => {
    it('creates document + executeRaw chunk when embedding present', async () => {
      mockedPrisma.document.create.mockResolvedValue({
        id: 42,
        userId: 1,
        filename: 'test.txt',
        fileType: 'text/plain',
        fileSize: 100,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockedEmbed.isAvailable.mockReturnValue(true);
      mockedEmbed.generateBatchEmbeddings.mockResolvedValue([[0.1, 0.2]]);
      mockedPrisma.$executeRawUnsafe.mockResolvedValue(1);

      const result = await DocumentService.uploadAndProcess(
        {
          originalname: 'test.txt',
          mimetype: 'text/plain',
          size: 100,
          buffer: Buffer.from('Текст для тестування', 'utf-8'),
        },
        1
      );

      expect(result.document).toMatchObject({
        id: 42,
        user_id: 1,
        filename: 'test.txt',
        file_type: 'text/plain',
        file_size: 100,
      });
      expect(result.chunksCount).toBe(1);
      expect(mockedPrisma.$transaction).toHaveBeenCalled();
      expect(mockedPrisma.document.create).toHaveBeenCalled();
      expect(mockedPrisma.$executeRawUnsafe).toHaveBeenCalled();
      expect(mockedPrisma.documentChunk.create).not.toHaveBeenCalled();
      expect(JSON.stringify(mockedPrisma)).not.toMatch(/CREATE TABLE/i);
    });

    it('uses documentChunk.createMany when embeddings unavailable', async () => {
      mockedPrisma.document.create.mockResolvedValue({
        id: 7,
        userId: 1,
        filename: 'a.txt',
        fileType: 'text/plain',
        fileSize: 3,
        createdAt: new Date(),
      });
      mockedEmbed.isAvailable.mockReturnValue(false);
      mockedPrisma.documentChunk.createMany.mockResolvedValue({ count: 1 });

      await DocumentService.uploadAndProcess(
        {
          originalname: 'a.txt',
          mimetype: 'text/plain',
          size: 3,
          buffer: Buffer.from('abc', 'utf-8'),
        },
        1
      );

      expect(mockedPrisma.$transaction).toHaveBeenCalled();
      expect(mockedPrisma.documentChunk.createMany).toHaveBeenCalledWith({
        data: [
          { documentId: 7, chunkIndex: 0, content: 'abc' },
        ],
      });
      expect(mockedPrisma.documentChunk.create).not.toHaveBeenCalled();
      expect(mockedPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('rejects files over MAX_FILE_SIZE', async () => {
      const prev = process.env.MAX_FILE_SIZE;
      process.env.MAX_FILE_SIZE = '5';
      try {
        await expect(
          DocumentService.uploadAndProcess(
            {
              originalname: 'big.txt',
              mimetype: 'text/plain',
              size: 10,
              buffer: Buffer.from('0123456789', 'utf-8'),
            },
            1
          )
        ).rejects.toThrow(/ліміт/i);
        expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
      } finally {
        if (prev === undefined) delete process.env.MAX_FILE_SIZE;
        else process.env.MAX_FILE_SIZE = prev;
      }
    });

    it('throws when extracted text empty', async () => {
      await expect(
        DocumentService.uploadAndProcess(
          {
            originalname: 'empty.txt',
            mimetype: 'text/plain',
            size: 0,
            buffer: Buffer.from('', 'utf-8'),
          },
          1
        )
      ).rejects.toThrow(/витягти текст/i);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getByUser', () => {
    it('returns snake_case rows with chunks_count', async () => {
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

      const rows = await DocumentService.getByUser(1);
      expect(rows[0]).toMatchObject({
        id: 1,
        user_id: 1,
        filename: 'a.pdf',
        file_type: 'application/pdf',
        file_size: 10,
        chunks_count: 5,
      });
      expect(mockedPrisma.document.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { chunks: true } } },
      });
    });
  });

  describe('delete', () => {
    it('returns true when count > 0', async () => {
      mockedPrisma.document.deleteMany.mockResolvedValue({ count: 1 });
      expect(await DocumentService.delete(1, 1)).toBe(true);
      expect(mockedPrisma.document.deleteMany).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
      });
    });

    it('returns false when count is 0', async () => {
      mockedPrisma.document.deleteMany.mockResolvedValue({ count: 0 });
      expect(await DocumentService.delete(99, 1)).toBe(false);
    });
  });
});
