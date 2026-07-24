/**
 * @file services/EmbeddingService.js
 * Сервіс генерації та збереження векторних представлень (embeddings) для RAG.
 * Підтримує OpenAI text-embedding-3-small як основний провайдер,
 * з graceful-деградацією якщо API ключ не налаштований.
 */

const axios = require('axios');
const logger = require('../logger');

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
/** Модель для embeddings (1536 вимірів, дешева та ефективна) */
const EMBEDDING_MODEL = 'text-embedding-3-small';
/** Розмірність вектора для моделі text-embedding-3-small */
const EMBEDDING_DIMENSIONS = 1536;

class EmbeddingService {
  /**
   * Перевіряє чи доступний OpenAI API для embeddings.
   * @returns {boolean}
   */
  static isAvailable() {
    return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here');
  }

  /**
   * Генерує vector embedding для одного тексту через OpenAI API.
   * @param {string} text - Текст для векторизації
   * @returns {Promise<number[]|null>} Масив чисел (вектор) або null при помилці
   */
  static async generateEmbedding(text) {
    if (!this.isAvailable()) {
      logger.warn('EmbeddingService: OPENAI_API_KEY not configured. Skipping embedding generation.');
      return null;
    }

    try {
      const cleanText = text.replace(/\n/g, ' ').trim();
      // OpenAI має ліміт ~8192 токенів; обрізаємо до ~6000 символів для безпеки
      const truncated = cleanText.length > 6000 ? cleanText.substring(0, 6000) : cleanText;

      const response = await axios.post(
        OPENAI_EMBEDDING_URL,
        {
          model: EMBEDDING_MODEL,
          input: truncated,
          dimensions: EMBEDDING_DIMENSIONS
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      logger.error(`EmbeddingService.generateEmbedding error: ${error.response?.data?.error?.message || error.message}`);
      return null;
    }
  }

  /**
   * Генерує embeddings для масиву текстів (batch запит до OpenAI).
   * Ефективніший ніж послідовні окремі запити.
   * @param {string[]} texts - Масив текстів
   * @returns {Promise<(number[]|null)[]>} Масив векторів (null для невдалих)
   */
  static async generateBatchEmbeddings(texts) {
    if (!this.isAvailable()) {
      logger.warn('EmbeddingService: OPENAI_API_KEY not configured. Skipping batch embedding.');
      return texts.map(() => null);
    }

    try {
      const cleanTexts = texts.map((t) => {
        const clean = t.replace(/\n/g, ' ').trim();
        return clean.length > 6000 ? clean.substring(0, 6000) : clean;
      });

      const response = await axios.post(
        OPENAI_EMBEDDING_URL,
        {
          model: EMBEDDING_MODEL,
          input: cleanTexts,
          dimensions: EMBEDDING_DIMENSIONS
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      // Сортуємо за index щоб зберегти порядок
      const embeddings = new Array(texts.length).fill(null);
      for (const item of response.data.data) {
        embeddings[item.index] = item.embedding;
      }

      logger.info(`EmbeddingService: Generated ${embeddings.filter(Boolean).length}/${texts.length} embeddings`);
      return embeddings;
    } catch (error) {
      logger.error(`EmbeddingService.generateBatchEmbeddings error: ${error.response?.data?.error?.message || error.message}`);
      return texts.map(() => null);
    }
  }

  /**
   * Знаходить найбільш релевантні чанки документа за семантичною схожістю (cosine similarity).
   * Якщо pgvector недоступний або embeddings відсутні — повертає перші N чанків (fallback).
   *
   * @param {object} pool - PostgreSQL connection pool
   * @param {number[]} queryEmbedding - Вектор запиту
   * @param {number} userId - ID користувача
   * @param {number[]} documentIds - ID обраних документів (порожній масив = всі)
   * @param {number} limit - Кількість релевантних чанків для повернення (за замовч. 5)
   * @returns {Promise<Array<{content: string, filename: string, similarity: number}>>}
   */
  static async findRelevantChunks(pool, queryEmbedding, userId, documentIds = [], limit = 5) {
    try {
      // Перевіряємо чи існує колонка embedding (pgvector може бути не встановлений)
      const columnCheck = await pool.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_chunks' AND column_name = 'embedding'
        LIMIT 1
      `);

      const hasPgVector = columnCheck.rows.length > 0;

      if (hasPgVector && queryEmbedding) {
        // === Семантичний пошук через косинусну схожість (pgvector) ===
        let query = `
          SELECT dc.content, d.filename,
                 1 - (dc.embedding <=> $1::vector) AS similarity
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id
          WHERE d.user_id = $2
            AND dc.embedding IS NOT NULL
        `;
        const params = [`[${queryEmbedding.join(',')}]`, userId];

        if (documentIds.length > 0) {
          params.push(documentIds);
          query += ` AND d.id = ANY($${params.length}::int[])`;
        }

        query += ` ORDER BY dc.embedding <=> $1::vector LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await pool.query(query, params);
        if (result.rows.length > 0) {
          logger.info(`EmbeddingService: Found ${result.rows.length} relevant chunks via vector search`);
          return result.rows;
        }
      }

      // === Fallback: повертаємо перші N чанків якщо pgvector недоступний ===
      logger.info('EmbeddingService: Using fallback chunk selection (no pgvector or no embeddings)');
      let fallbackQuery = `
        SELECT dc.content, d.filename, 1.0 AS similarity
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.document_id
        WHERE d.user_id = $1
      `;
      const fallbackParams = [userId];

      if (documentIds.length > 0) {
        fallbackParams.push(documentIds);
        fallbackQuery += ` AND d.id = ANY($${fallbackParams.length}::int[])`;
      }

      fallbackQuery += ` ORDER BY dc.id ASC LIMIT $${fallbackParams.length + 1}`;
      fallbackParams.push(limit * 2); // Більше чанків при fallback

      const fallbackResult = await pool.query(fallbackQuery, fallbackParams);
      return fallbackResult.rows;
    } catch (error) {
      logger.error(`EmbeddingService.findRelevantChunks error: ${error.message}`);
      return [];
    }
  }
}

module.exports = EmbeddingService;
