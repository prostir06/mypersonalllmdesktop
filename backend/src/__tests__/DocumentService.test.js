const DocumentService = require('../services/DocumentService');
const EmbeddingService = require('../services/EmbeddingService');
const pool = require('../config/database');

jest.mock('../config/database');
jest.mock('../services/EmbeddingService');
jest.mock('../logger');

describe('DocumentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('chunkText', () => {
    it('повинен повертати пустий масив для порожнього тексту', () => {
      expect(DocumentService.chunkText('')).toEqual([]);
      expect(DocumentService.chunkText(null)).toEqual([]);
    });

    it('повинен повертати один чанк, якщо текст менший за chunkSize', () => {
      const text = 'Короткий текст';
      const chunks = DocumentService.chunkText(text, 1000, 200);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('повинен розбивати довгий текст на кілька чанків з перекриттям', () => {
      // Створюємо текст, більший за 100 символів (щоб розбити при chunkSize 100)
      const text = 'А'.repeat(100) + 'Б'.repeat(100) + 'В'.repeat(100);
      const chunks = DocumentService.chunkText(text, 100, 20); // 100 розмір, 20 перекриття
      
      expect(chunks.length).toBeGreaterThan(1);
      // Перевіряємо, чи є перекриття (перший і другий чанк мають спільні символи)
      expect(chunks[1].startsWith('А'.repeat(20))).toBe(true);
    });
  });

  describe('extractText', () => {
    // pdf-parse та mammoth зазвичай потребують повного моку, тому ми тестуємо тільки fallback на txt
    it('повинен повертати текст як є для TXT файлів', async () => {
      const buffer = Buffer.from('Тестовий текст', 'utf-8');
      const text = await DocumentService.extractText(buffer, 'text/plain', 'test.txt');
      expect(text).toBe('Тестовий текст');
    });
  });

  describe('uploadAndProcess', () => {
    it('повинен обробляти файл, генерувати чанки та зберігати в БД', async () => {
      const mockFileInfo = {
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 100,
        buffer: Buffer.from('Текст для тестування чанкінгу і збереження', 'utf-8')
      };

      pool.query.mockResolvedValueOnce({}); // ensureTablesExist
      pool.query.mockResolvedValueOnce({ rows: [{ id: 42 }] }); // insert doc metadata
      
      EmbeddingService.isAvailable.mockReturnValue(true);
      EmbeddingService.generateBatchEmbeddings.mockResolvedValueOnce([[0.1, 0.2]]);

      // mock для збереження чанку
      pool.query.mockResolvedValueOnce({});

      const result = await DocumentService.uploadAndProcess(mockFileInfo, 1);
      
      expect(result.document.id).toBe(42);
      expect(result.chunksCount).toBe(1);
      
      // Перевіряємо виклики БД
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO documents'), expect.any(Array));
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO document_chunks'), expect.any(Array));
      expect(EmbeddingService.generateBatchEmbeddings).toHaveBeenCalledTimes(1);
    });

    it('повинен викидати помилку, якщо текст порожній', async () => {
      const mockFileInfo = {
        originalname: 'empty.txt',
        mimetype: 'text/plain',
        size: 0,
        buffer: Buffer.from('', 'utf-8')
      };

      await expect(DocumentService.uploadAndProcess(mockFileInfo, 1))
        .rejects.toThrow('Не вдалося витягти текст');
    });
  });

  describe('getByUser', () => {
    it('повинен повертати масив документів користувача', async () => {
      const mockDocs = [{ id: 1, filename: 'test.txt', chunks_count: 5 }];
      pool.query.mockResolvedValueOnce({ rows: mockDocs });

      const result = await DocumentService.getByUser(1);
      expect(result).toEqual(mockDocs);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT d.*'), [1]);
    });
  });

  describe('delete', () => {
    it('повинен повертати true, якщо видалено', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const result = await DocumentService.delete(1, 1);
      expect(result).toBe(true);
    });

    it('повинен повертати false, якщо документ не знайдено', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const result = await DocumentService.delete(99, 1);
      expect(result).toBe(false);
    });
  });
});
