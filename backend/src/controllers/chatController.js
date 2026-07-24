/**
 * @file controllers/chatController.js
 * Контролер обробки чат запитів.
 * Підтримує системні промпти з налаштувань користувача та розширення RAG (Retrieval-Augmented Generation).
 */

const pool = require('../config/database');
const logger = require('../logger');
const ProviderFactory = require('../services/providerFactory');
const EmbeddingService = require('../services/EmbeddingService');

/**
 * Допоміжна функція побудови системного контексту з урахуванням системного промпту та RAG документів
 */
async function buildSystemContext(userId, options = {}, userMessage = '') {
  const systemMessages = [];

  // 1. Отримуємо системний промпт за замовчуванням з налаштувань
  try {
    const settingsRes = await pool.query(
      'SELECT system_prompt FROM user_settings WHERE user_id = $1',
      [userId]
    );
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].system_prompt) {
      systemMessages.push({
        role: 'system',
        content: settingsRes.rows[0].system_prompt
      });
    }
  } catch (err) {
    // Якщо колонка ще не створена — ігноруємо
  }

  // 2. Якщо увімкнено RAG або передано documentIds — підтягуємо релевантні фрагменти документів
  const documentIds = options.documentIds || [];
  const ragEnabled = options.ragEnabled || documentIds.length > 0;

  if (ragEnabled) {
    try {
      // === Семантичний пошук (векторна схожість через pgvector) ===
      // 1. Генеруємо embedding для поточного запиту користувача
      let queryEmbedding = null;
      if (userMessage && EmbeddingService.isAvailable()) {
        queryEmbedding = await EmbeddingService.generateEmbedding(userMessage);
      }

      // 2. Знаходимо найбільш релевантні чанки (векторний пошук або fallback)
      const relevantChunks = await EmbeddingService.findRelevantChunks(
        pool,
        queryEmbedding,
        userId,
        documentIds,
        5 // Максимальна кількість релевантних фрагментів
      );

      if (relevantChunks.length > 0) {
        const searchMethod = queryEmbedding ? 'векторний пошук' : 'fallback';
        const ragContextText = [
          `📄 КОНТЕКСТ З ЗАВАНТАЖЕНИХ ДОКУМЕНТІВ (${searchMethod}):`,
          ...relevantChunks.map((c) => {
            const similarityInfo = c.similarity && c.similarity < 1
              ? ` [relevance: ${(c.similarity * 100).toFixed(0)}%]`
              : '';
            return `--- [Файл: ${c.filename}${similarityInfo}] ---\n${c.content}`;
          })
        ].join('\n\n');

        systemMessages.push({
          role: 'system',
          content: ragContextText
        });

        logger.info(`RAG: Added ${relevantChunks.length} relevant chunks via ${searchMethod} for user ${userId}`);
      }
    } catch (ragErr) {
      logger.warn(`RAG context fetch error: ${ragErr.message}`);
    }
  }

  return systemMessages;
}

class ChatController {
  static async sendMessage(req, res, next) {
    try {
      const { conversationId, message, model, provider, options } = req.body;
      const userId = req.userId;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      if (message.length > 4000) {
        return res.status(400).json({ error: 'Message too long (max 4000 characters)' });
      }

      let convId = conversationId;

      if (!convId) {
        const result = await pool.query(
          'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id',
          [userId, message.substring(0, 50) + (message.length > 50 ? '...' : '')]
        );
        convId = result.rows[0].id;
      } else {
        const convCheck = await pool.query(
          'SELECT user_id FROM conversations WHERE id = $1',
          [convId]
        );
        if (convCheck.rows.length === 0 || convCheck.rows[0].user_id !== userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      const messagesResult = await pool.query(
        'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 50',
        [convId]
      );

      const systemMessages = await buildSystemContext(userId, options, message);

      const chatMessages = [
        ...systemMessages,
        ...messagesResult.rows,
        { role: 'user', content: message }
      ];

      const response = await ProviderFactory.sendMessage(
        provider || 'openai',
        chatMessages,
        model || 'gpt-3.5-turbo',
        options
      );

      await pool.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [convId, 'user', message]
      );

      const msgResult = await pool.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING id, created_at',
        [convId, 'assistant', response.content]
      );

      await pool.query(
        'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
        [convId]
      );

      logger.info(`Message sent in conversation ${convId} by user ${userId}`);

      res.json({
        conversationId: convId,
        messageId: msgResult.rows[0].id,
        content: response.content,
        role: 'assistant',
        timestamp: msgResult.rows[0].created_at,
        usage: response.usage
      });
    } catch (error) {
      logger.error(`Error in sendMessage: ${error.message}`);
      res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
  }

  static async streamMessage(req, res, next) {
    try {
      const { conversationId, message, model, provider, options } = req.body;
      const userId = req.userId;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      let convId = conversationId;

      if (!convId) {
        const result = await pool.query(
          'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id',
          [userId, message.substring(0, 50) + (message.length > 50 ? '...' : '')]
        );
        convId = result.rows[0].id;
      } else {
        const convCheck = await pool.query(
          'SELECT user_id FROM conversations WHERE id = $1',
          [convId]
        );
        if (convCheck.rows.length === 0 || convCheck.rows[0].user_id !== userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      const messagesResult = await pool.query(
        'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 50',
        [convId]
      );

      const systemMessages = await buildSystemContext(userId, options, message);

      const chatMessages = [
        ...systemMessages,
        ...messagesResult.rows,
        { role: 'user', content: message }
      ];

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      res.write(`data: ${JSON.stringify({ type: 'init', conversationId: convId })}\n\n`);

      const response = await ProviderFactory.streamMessage(
        provider || 'openai',
        chatMessages,
        model || 'gpt-3.5-turbo',
        options,
        (token) => {
          res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
        }
      );

      await pool.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [convId, 'user', message]
      );

      const msgResult = await pool.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING id, created_at',
        [convId, 'assistant', response.content]
      );

      await pool.query(
        'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
        [convId]
      );

      res.write(`data: ${JSON.stringify({ type: 'done', messageId: msgResult.rows[0].id, content: response.content })}\n\n`);
      res.end();
    } catch (error) {
      logger.error(`Error in streamMessage: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream message', details: error.message });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
      }
    }
  }

  static async getHistory(req, res, next) {
    try {
      const { conversationId } = req.params;
      const userId = req.userId;
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);

      const convCheck = await pool.query(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );

      if (convCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const result = await pool.query(
        `SELECT id, role, content, created_at FROM messages 
         WHERE conversation_id = $1 
         ORDER BY created_at ASC 
         LIMIT $2 OFFSET $3`,
        [conversationId, limit, offset]
      );

      res.json({
        messages: result.rows,
        total: result.rows.length,
        limit,
        offset
      });
    } catch (error) {
      logger.error(`Error in getHistory: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch conversation history', details: error.message });
    }
  }

  static async updateConversation(req, res, next) {
    try {
      const { conversationId } = req.params;
      const { title } = req.body;
      const userId = req.userId;

      if (!title || title.length > 255) {
        return res.status(400).json({ error: 'Title must be between 1 and 255 characters' });
      }

      const result = await pool.query(
        'UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
        [title, conversationId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error(`Error in updateConversation: ${error.message}`);
      res.status(500).json({ error: 'Failed to update conversation', details: error.message });
    }
  }

  static async deleteConversation(req, res, next) {
    try {
      const { conversationId } = req.params;
      const userId = req.userId;

      const result = await pool.query(
        'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
        [conversationId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      logger.info(`Conversation ${conversationId} deleted by user ${userId}`);

      res.json({ message: 'Conversation deleted successfully' });
    } catch (error) {
      logger.error(`Error in deleteConversation: ${error.message}`);
      res.status(500).json({ error: 'Failed to delete conversation', details: error.message });
    }
  }
}

module.exports = ChatController;
