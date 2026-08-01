jest.mock('axios');
jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import axios from 'axios';
import prisma from '../config/prisma';
import logger from '../logger';
import EmbeddingService from '../services/EmbeddingService';

const mockedAxios = axios as unknown as { post: jest.Mock };
const mockedPrisma = prisma as unknown as { $queryRawUnsafe: jest.Mock };

describe('EmbeddingService (Prisma)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isAvailable', () => {
    it('returns true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      expect(EmbeddingService.isAvailable()).toBe(true);
    });

    it('returns false when key missing or placeholder', () => {
      delete process.env.OPENAI_API_KEY;
      expect(EmbeddingService.isAvailable()).toBe(false);
      process.env.OPENAI_API_KEY = 'your_openai_api_key_here';
      expect(EmbeddingService.isAvailable()).toBe(false);
    });
  });

  describe('generateEmbedding', () => {
    it('returns null when unavailable', async () => {
      delete process.env.OPENAI_API_KEY;
      await expect(EmbeddingService.generateEmbedding('x')).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns vector and truncates long input', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: { data: [{ embedding: [0.1, 0.2] }] },
      });
      const long = 'A'.repeat(8000);
      const result = await EmbeddingService.generateEmbedding(long);
      expect(result).toEqual([0.1, 0.2]);
      expect(mockedAxios.post.mock.calls[0][1].input.length).toBeLessThanOrEqual(6000);
    });

    it('returns null when OpenAI request fails', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('network'));
      await expect(EmbeddingService.generateEmbedding('hi')).resolves.toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('preserves order by index', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          data: [
            { index: 1, embedding: [0.2] },
            { index: 0, embedding: [0.1] },
          ],
        },
      });
      await expect(
        EmbeddingService.generateBatchEmbeddings(['first', 'second'])
      ).resolves.toEqual([[0.1], [0.2]]);
    });

    it('returns nulls when batch request fails', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('timeout'));
      await expect(
        EmbeddingService.generateBatchEmbeddings(['a', 'b'])
      ).resolves.toEqual([null, null]);
    });
  });

  describe('findRelevantChunks', () => {
    it('uses vector path when column exists and embedding provided', async () => {
      mockedPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([
          { content: 'vector text', filename: 'doc2.txt', similarity: 0.95 },
        ]);

      const result = await EmbeddingService.findRelevantChunks(
        [0.1, 0.2],
        1,
        [],
        5
      );

      expect(result).toEqual([
        { content: 'vector text', filename: 'doc2.txt', similarity: 0.95 },
      ]);
      expect(mockedPrisma.$queryRawUnsafe.mock.calls[1][0]).toContain('<=>');
      expect(mockedPrisma.$queryRawUnsafe.mock.calls[1][0]).not.toMatch(/\bpool\b/);
    });

    it('falls back when no pgvector column', async () => {
      mockedPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { content: 'fallback text', filename: 'doc.txt', similarity: 1.0 },
        ]);

      const result = await EmbeddingService.findRelevantChunks([0.1], 1, [], 5);
      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(1.0);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('fallback')
      );
    });

    it('passes documentIds into vector query params', async () => {
      mockedPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([
          { content: 'scoped', filename: 'a.txt', similarity: 0.8 },
        ]);

      await EmbeddingService.findRelevantChunks([0.1], 9, [3, 7], 2);
      const vectorCall = mockedPrisma.$queryRawUnsafe.mock.calls[1];
      expect(vectorCall[0]).toContain('ANY');
      expect(vectorCall).toContainEqual([3, 7]);
    });

    it('returns [] when DB throws', async () => {
      mockedPrisma.$queryRawUnsafe.mockRejectedValue(new Error('db'));
      await expect(
        EmbeddingService.findRelevantChunks([0.1], 1, [], 5)
      ).resolves.toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('signature has no pool argument', () => {
      expect(EmbeddingService.findRelevantChunks.length).toBeLessThanOrEqual(4);
    });
  });
});
