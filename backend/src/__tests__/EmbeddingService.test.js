const EmbeddingService = require('../services/EmbeddingService');
const axios = require('axios');
const logger = require('../logger');

jest.mock('axios');
jest.mock('../logger');

describe('EmbeddingService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isAvailable', () => {
    it('повинен повертати true, якщо OPENAI_API_KEY налаштовано', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      expect(EmbeddingService.isAvailable()).toBe(true);
    });

    it('повинен повертати false, якщо OPENAI_API_KEY не налаштовано', () => {
      delete process.env.OPENAI_API_KEY;
      expect(EmbeddingService.isAvailable()).toBe(false);
    });

    it('повинен повертати false, якщо OPENAI_API_KEY є дефолтним', () => {
      process.env.OPENAI_API_KEY = 'your_openai_api_key_here';
      expect(EmbeddingService.isAvailable()).toBe(false);
    });
  });

  describe('generateEmbedding', () => {
    it('повинен повертати null, якщо API недоступний', async () => {
      delete process.env.OPENAI_API_KEY;
      const result = await EmbeddingService.generateEmbedding('test text');
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('повинен повертати вектор чисел при успішному запиті', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const mockVector = [0.1, 0.2, 0.3];
      axios.post.mockResolvedValueOnce({
        data: { data: [{ embedding: mockVector }] }
      });

      const result = await EmbeddingService.generateEmbedding('test text');
      expect(result).toEqual(mockVector);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('повинен обрізати занадто довгий текст', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const longText = 'A'.repeat(8000);
      axios.post.mockResolvedValueOnce({
        data: { data: [{ embedding: [0.1] }] }
      });

      await EmbeddingService.generateEmbedding(longText);
      
      const callArgs = axios.post.mock.calls[0][1];
      expect(callArgs.input.length).toBeLessThanOrEqual(6000);
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('повинен повертати масив null, якщо API недоступний', async () => {
      delete process.env.OPENAI_API_KEY;
      const result = await EmbeddingService.generateBatchEmbeddings(['t1', 't2']);
      expect(result).toEqual([null, null]);
    });

    it('повинен зберігати порядок масиву відповідей', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      axios.post.mockResolvedValueOnce({
        data: {
          data: [
            { index: 1, embedding: [0.2] },
            { index: 0, embedding: [0.1] }
          ]
        }
      });

      const result = await EmbeddingService.generateBatchEmbeddings(['first', 'second']);
      expect(result).toEqual([[0.1], [0.2]]);
    });
  });

  describe('findRelevantChunks', () => {
    let mockPool;

    beforeEach(() => {
      mockPool = {
        query: jest.fn()
      };
    });

    it('повинен використовувати fallback, якщо pgvector недоступний', async () => {
      // Мокуємо відсутність колонки embedding
      mockPool.query.mockResolvedValueOnce({ rows: [] }); 
      // Fallback query result
      mockPool.query.mockResolvedValueOnce({ 
        rows: [{ content: 'fallback text', filename: 'doc.txt', similarity: 1.0 }] 
      });

      const result = await EmbeddingService.findRelevantChunks(mockPool, [0.1], 1, [], 5);
      
      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(1.0);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('fallback'));
    });

    it('повинен використовувати pgvector, якщо він доступний та є вектор запиту', async () => {
      // Мокуємо наявність колонки embedding
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); 
      // Vector query result
      mockPool.query.mockResolvedValueOnce({ 
        rows: [{ content: 'vector text', filename: 'doc2.txt', similarity: 0.95 }] 
      });

      const result = await EmbeddingService.findRelevantChunks(mockPool, [0.1, 0.2], 1, [], 5);
      
      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(0.95);
      // Перевіряємо, чи був викликаний векторний запит
      expect(mockPool.query.mock.calls[1][0]).toContain('<=>');
    });
  });
});
