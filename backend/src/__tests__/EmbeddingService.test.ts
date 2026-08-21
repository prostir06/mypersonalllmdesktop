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
    EmbeddingService.resetEmbeddingColumnCache();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isAvailable', () => {
    it('returns true when openai context has key', () => {
      expect(
        EmbeddingService.isAvailable({ provider: 'openai', openaiKey: 'test-key' })
      ).toBe(true);
    });

    it('returns true when ollama context has host', () => {
      expect(
        EmbeddingService.isAvailable({
          provider: 'ollama',
          ollamaHost: 'http://127.0.0.1:11434/v1/chat/completions',
        })
      ).toBe(true);
    });

    it('returns false when provider none', () => {
      expect(EmbeddingService.isAvailable({ provider: 'none' })).toBe(false);
    });
  });

  describe('generateEmbedding', () => {
    const openaiCtx = { provider: 'openai' as const, openaiKey: 'test-key' };

    it('returns null when unavailable', async () => {
      await expect(
        EmbeddingService.generateEmbedding('x', { provider: 'none' })
      ).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns vector and truncates long input', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: { data: [{ embedding: [0.1, 0.2] }] },
      });
      const long = 'A'.repeat(8000);
      const result = await EmbeddingService.generateEmbedding(long, openaiCtx);
      expect(result).toEqual([0.1, 0.2]);
      expect(mockedAxios.post.mock.calls[0][1].input.length).toBeLessThanOrEqual(
        6000
      );
      expect(mockedAxios.post.mock.calls[0][1].dimensions).toBe(768);
    });

    it('returns null when OpenAI request fails', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('network'));
      await expect(
        EmbeddingService.generateEmbedding('hi', openaiCtx)
      ).resolves.toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('generateBatchEmbeddings', () => {
    const openaiCtx = { provider: 'openai' as const, openaiKey: 'test-key' };

    it('preserves order by index', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          data: [
            { index: 1, embedding: [0.2] },
            { index: 0, embedding: [0.1] },
          ],
        },
      });
      await expect(
        EmbeddingService.generateBatchEmbeddings(['first', 'second'], openaiCtx)
      ).resolves.toEqual([[0.1], [0.2]]);
    });

    it('returns nulls when batch request fails', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('timeout'));
      await expect(
        EmbeddingService.generateBatchEmbeddings(['a', 'b'], openaiCtx)
      ).resolves.toEqual([null, null]);
    });

    it('splits large inputs into multiple OpenAI requests', async () => {
      const texts = Array.from({ length: 101 }, (_, i) => `t${i}`);
      mockedAxios.post = jest.fn().mockImplementation((_url, body) => {
        const data = body.input.map((_t: string, index: number) => ({
          index,
          embedding: [body.input.length === 100 ? 1 : 2],
        }));
        return Promise.resolve({ data: { data } });
      });

      const result = await EmbeddingService.generateBatchEmbeddings(
        texts,
        openaiCtx
      );
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockedAxios.post.mock.calls[0][1].input).toHaveLength(100);
      expect(mockedAxios.post.mock.calls[1][1].input).toHaveLength(1);
      expect(result).toHaveLength(101);
      expect(result[0]).toEqual([1]);
      expect(result[100]).toEqual([2]);
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
      const fallbackSql = mockedPrisma.$queryRawUnsafe.mock.calls[1][0] as string;
      expect(fallbackSql).toMatch(/ORDER BY d\.created_at DESC/i);
      expect(fallbackSql).toMatch(/dc\.chunk_index ASC/i);
    });

    it('caches embedding-column probe across findRelevantChunks calls', async () => {
      mockedPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([
          { content: 'vector text', filename: 'doc2.txt', similarity: 0.95 },
        ])
        .mockResolvedValueOnce([
          { content: 'vector text 2', filename: 'doc3.txt', similarity: 0.9 },
        ]);

      await EmbeddingService.findRelevantChunks([0.1, 0.2], 1, [], 5);
      await EmbeddingService.findRelevantChunks([0.3, 0.4], 1, [], 5);

      const probeCalls = mockedPrisma.$queryRawUnsafe.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('information_schema.columns')
      );
      expect(probeCalls).toHaveLength(1);
      expect(mockedPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
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

    it('filters low-similarity vector hits and falls back when none remain', async () => {
      mockedPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([
          { content: 'weak', filename: 'w.txt', similarity: 0.05 },
        ])
        .mockResolvedValueOnce([
          { content: 'fallback text', filename: 'doc.txt', similarity: 1.0 },
        ]);

      const result = await EmbeddingService.findRelevantChunks(
        [0.1, 0.2],
        1,
        [],
        5,
        { minSimilarity: 0.25 }
      );

      expect(result).toEqual([
        { content: 'fallback text', filename: 'doc.txt', similarity: 1.0 },
      ]);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('fallback')
      );
    });

    it('packs vector hits under maxChars budget', async () => {
      mockedPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([
          { content: 'AAAA', filename: 'a.txt', similarity: 0.9 },
          { content: 'BBBBBB', filename: 'b.txt', similarity: 0.8 },
        ]);

      const result = await EmbeddingService.findRelevantChunks(
        [0.1],
        1,
        [],
        5,
        { minSimilarity: 0.25, maxChars: 4 }
      );

      expect(result).toEqual([
        { content: 'AAAA', filename: 'a.txt', similarity: 0.9 },
      ]);
    });

    it('signature has no pool argument', () => {
      expect(EmbeddingService.findRelevantChunks.length).toBeLessThanOrEqual(7);
    });

    it('uses hybrid vector+FTS when queryText and embedding provided', async () => {
      mockedPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([
          {
            chunk_id: 1,
            content: 'vector text',
            filename: 'doc2.txt',
            similarity: 0.95,
          },
        ])
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([
          {
            chunk_id: 1,
            content: 'vector text',
            filename: 'doc2.txt',
            rank: 0.5,
          },
          {
            chunk_id: 2,
            content: 'keyword hit',
            filename: 'doc3.txt',
            rank: 0.8,
          },
        ]);

      const result = await EmbeddingService.findRelevantChunks(
        [0.1, 0.2],
        1,
        [],
        5,
        {},
        'openai',
        'keyword query'
      );

      expect(result.length).toBeGreaterThan(0);
      const ftsSql = mockedPrisma.$queryRawUnsafe.mock.calls[3][0] as string;
      expect(ftsSql).toContain('plainto_tsquery');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('hybrid')
      );
    });

    it('uses FTS when embeddings unavailable but query text provided', async () => {
      mockedPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([
          {
            chunk_id: 3,
            content: 'fts only',
            filename: 'doc.txt',
            rank: 0.6,
          },
        ]);

      const result = await EmbeddingService.findRelevantChunks(
        null,
        1,
        [],
        5,
        {},
        null,
        'invoice number'
      );

      expect(result).toEqual([
        { content: 'fts only', filename: 'doc.txt', similarity: 1 },
      ]);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('FTS')
      );
    });

    it('logs requestId and documentIds when Prisma rejects, then rethrows', async () => {
      mockedPrisma.$queryRawUnsafe.mockRejectedValue(new Error('db down'));

      await expect(
        EmbeddingService.findRelevantChunks(
          [0.1],
          9,
          [3, 7],
          2,
          { requestId: 'rid-rag-1' }
        )
      ).rejects.toThrow('db down');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/findRelevantChunks.*db down.*requestId=rid-rag-1.*userId=9.*documentIds=3,7/)
      );
    });

    it('filters by embedding_provider in vector query', async () => {
      mockedPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([
          { content: 'scoped', filename: 'a.txt', similarity: 0.8 },
        ]);

      await EmbeddingService.findRelevantChunks(
        [0.1],
        9,
        [],
        2,
        {},
        'ollama'
      );
      const vectorCall = mockedPrisma.$queryRawUnsafe.mock.calls[1];
      expect(vectorCall[0]).toContain('embedding_provider');
      expect(vectorCall).toContainEqual('ollama');
    });
  });
});
