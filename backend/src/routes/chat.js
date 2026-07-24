/**
 * @file routes/chat.js
 * REST API маршрути для чату: надсилання повідомлень, streaming, пошук у повідомленнях.
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../config/database');
const logger = require('../logger');
const ChatController = require('../controllers/chatController');

/** POST /api/chat/send — надіслати повідомлення (звичайний REST) */
router.post('/send', auth, ChatController.sendMessage);

/** POST /api/chat/stream — надіслати повідомлення через SSE streaming */
router.post('/stream', auth, ChatController.streamMessage);

/** GET /api/chat/history/:conversationId — отримати історію розмови */
router.get('/history/:conversationId', auth, ChatController.getHistory);

/**
 * GET /api/chat/search?q=<query>&conversationId=<id>
 * Повнотекстовий пошук по повідомленнях поточного користувача.
 * Використовує PostgreSQL ILIKE для широкої сумісності (без tsvector extension).
 */
router.get('/search', auth, async (req, res) => {
  const { q, conversationId } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Пошуковий запит має бути не менше 2 символів' });
  }

  try {
    let query;
    let params;

    if (conversationId) {
      // Пошук в конкретній розмові
      query = `
        SELECT m.id, m.role, m.content, m.created_at,
               c.id AS conversation_id, c.title AS conversation_title
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE c.user_id = $1
          AND m.conversation_id = $2
          AND m.content ILIKE $3
        ORDER BY m.created_at DESC
        LIMIT 50
      `;
      params = [req.userId, conversationId, `%${q.trim()}%`];
    } else {
      // Глобальний пошук по всіх розмовах
      query = `
        SELECT m.id, m.role, m.content, m.created_at,
               c.id AS conversation_id, c.title AS conversation_title
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE c.user_id = $1
          AND m.content ILIKE $2
        ORDER BY m.created_at DESC
        LIMIT 50
      `;
      params = [req.userId, `%${q.trim()}%`];
    }

    const result = await pool.query(query, params);
    res.json({ results: result.rows, total: result.rows.length });
  } catch (error) {
    logger.error(`GET /chat/search error: ${error.message}`);
    res.status(500).json({ error: 'Помилка пошуку' });
  }
});

module.exports = router;
