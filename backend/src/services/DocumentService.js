/**
 * @file services/DocumentService.js
 * Сервіс обробки документів для RAG.
 * Інкапсулює логіку парсингу файлів, чанкінгу тексту та взаємодії з БД.
 * Вилучено з routes/documents.js для кращого розділення відповідальності.
 */

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const pool = require('../config/database');
const logger = require('../logger');
const EmbeddingService = require('./EmbeddingService');

class DocumentService {
  /**
   * Розбиває текст на фрагменти (чанки) з перекриттям.
   * @param {string} text - Повний текст документа
   * @param {number} chunkSize - Розмір чанка в символах (за замовч. ~500 токенів)
   * @param {number} overlap - Перекриття між чанками (за замовч. ~100 токенів)
   * @returns {string[]} Масив текстових фрагментів
   */
  static chunkText(text, chunkSize = 1500, overlap = 300) {
    if (!text || typeof text !== 'string') return [];
    const cleaned = text.replace(/\r\n/g, '\n').trim();
    if (cleaned.length <= chunkSize) return [cleaned];

    const chunks = [];
    let start = 0;

    while (start < cleaned.length) {
      let end = start + chunkSize;
      if (end < cleaned.length) {
        // Намагаємося розбити по абзацу або реченню для кращого контексту
        const lastBreak = cleaned.lastIndexOf('\n\n', end);
        if (lastBreak > start + chunkSize / 2) {
          end = lastBreak;
        } else {
          const lastSentence = cleaned.lastIndexOf('. ', end);
          if (lastSentence > start + chunkSize / 2) {
            end = lastSentence + 1;
          }
        }
      }
      const chunk = cleaned.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      start = end - overlap;
    }

    return chunks;
  }

  /**
   * Витягує текстовий вміст з файлу залежно від його типу.
   * @param {Buffer} buffer - Буфер файлу
   * @param {string} mimetype - MIME тип файлу
   * @param {string} originalname - Оригінальне ім'я файлу
   * @returns {Promise<string>} Витягнутий текст
   */
  static async extractText(buffer, mimetype, originalname) {
    if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
      const pdfData = await pdfParse(buffer);
      return pdfData.text;
    }

    if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalname.endsWith('.docx')
    ) {
      const docxResult = await mammoth.extractRawText({ buffer });
      return docxResult.value;
    }

    // TXT / MD — повертаємо як є
    return buffer.toString('utf-8');
  }

  /**
   * Забезпечує існування необхідних таблиць для RAG в БД.
   * Безпечно викликати кілька разів (CREATE TABLE IF NOT EXISTS).
   */
  static async ensureTablesExist() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        filename VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
    `);
  }

  /**
   * Завантажує документ: парсить, чанкує та зберігає в БД.
   * @param {object} fileInfo - Інформація про файл з multer {originalname, mimetype, size, buffer}
   * @param {number} userId - ID користувача
   * @returns {Promise<{document: object, chunksCount: number}>}
   */
  static async uploadAndProcess(fileInfo, userId) {
    const { originalname, mimetype, size, buffer } = fileInfo;

    const extractedText = await this.extractText(buffer, mimetype, originalname);

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('Не вдалося витягти текст з надісланого файлу');
    }

    await this.ensureTablesExist();

    // Зберігаємо метадані документа
    const docResult = await pool.query(
      `INSERT INTO documents (user_id, filename, file_type, file_size)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, originalname, mimetype, size]
    );
    const docId = docResult.rows[0].id;

    // Чанкінг та збереження фрагментів
    const chunks = this.chunkText(extractedText);

    // Генеруємо embeddings для всіх чанків (batch запит до OpenAI)
    let embeddings = [];
    if (EmbeddingService.isAvailable()) {
      embeddings = await EmbeddingService.generateBatchEmbeddings(chunks);
    }

    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddings[i] || null;
      if (embedding) {
        // Зберігаємо з вектором (pgvector формат)
        await pool.query(
          `INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4::vector)`,
          [docId, i, chunks[i], `[${embedding.join(',')}]`]
        );
      } else {
        // Зберігаємо без вектора (fallback, якщо embeddings недоступні)
        await pool.query(
          `INSERT INTO document_chunks (document_id, chunk_index, content)
           VALUES ($1, $2, $3)`,
          [docId, i, chunks[i]]
        );
      }
    }

    logger.info(`Document uploaded & chunked: ${originalname} (id=${docId}, ${chunks.length} chunks, embeddings=${embeddings.filter(Boolean).length})`);
    if (!EmbeddingService.isAvailable()) {
      logger.warn('Embeddings not generated: OPENAI_API_KEY not configured. RAG will use fallback chunk selection.');
    }

    return {
      document: docResult.rows[0],
      chunksCount: chunks.length
    };
  }

  /**
   * Отримує список документів користувача з кількістю чанків.
   * @param {number} userId - ID користувача
   * @returns {Promise<object[]>} Масив документів
   */
  static async getByUser(userId) {
    const result = await pool.query(
      `SELECT d.*, COUNT(dc.id)::int AS chunks_count
       FROM documents d
       LEFT JOIN document_chunks dc ON dc.document_id = d.id
       WHERE d.user_id = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Видаляє документ та всі його чанки (CASCADE через FK).
   * @param {number} docId - ID документа
   * @param {number} userId - ID користувача (для перевірки прав)
   * @returns {Promise<boolean>} true якщо видалено, false якщо не знайдено
   */
  static async delete(docId, userId) {
    const result = await pool.query(
      'DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id',
      [docId, userId]
    );
    return result.rows.length > 0;
  }
}

module.exports = DocumentService;
