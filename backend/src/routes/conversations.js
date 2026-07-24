/**
 * @file routes/conversations.js
 * REST API маршрути для управління розмовами.
 * DELETE виконується в транзакції для запобігання неконсистентного стану БД.
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../config/database');
const logger = require('../logger');

/**
 * GET /api/conversations
 * Повертає всі розмови поточного користувача, відсортовані за часом оновлення
 */
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, created_at, updated_at
       FROM conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error(`GET /conversations error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /api/conversations/:conversationId
 * Повертає конкретну розмову по ID (тільки якщо вона належить поточному користувачеві)
 */
router.get('/:conversationId', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
      [req.params.conversationId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error(`GET /conversations/${req.params.conversationId} error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/**
 * POST /api/conversations
 * Створює нову розмову для поточного користувача
 */
router.post('/', auth, async (req, res) => {
  const { title } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
      [req.userId, title || 'Нова розмова']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error(`POST /conversations error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * PUT /api/conversations/:conversationId
 * Оновлює назву розмови
 */
router.put('/:conversationId', auth, async (req, res) => {
  const { title } = req.body;

  try {
    const result = await pool.query(
      `UPDATE conversations
       SET title = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 RETURNING *`,
      [title, req.params.conversationId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error(`PUT /conversations/${req.params.conversationId} error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

/**
 * DELETE /api/conversations/:conversationId
 * Видаляє розмову разом з усіма повідомленнями — в рамках однієї транзакції.
 * Транзакція гарантує атомарність: або видаляється все, або нічого.
 */
router.delete('/:conversationId', auth, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Видаляємо повідомлення розмови
    await client.query(
      'DELETE FROM messages WHERE conversation_id = $1',
      [req.params.conversationId]
    );

    // Видаляємо саму розмову (перевіряємо належність користувачеві)
    const result = await client.query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.conversationId, req.userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`DELETE /conversations/${req.params.conversationId} error: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete conversation' });
  } finally {
    client.release();
  }
});


/**
 * GET /api/conversations/:conversationId/export?format=md|json|txt
 * Експортує розмову у вибраному форматі для завантаження.
 */
router.get('/:conversationId/export', auth, async (req, res) => {
  const { format = 'md' } = req.query;

  try {
    // Перевіряємо чи розмова належить поточному користувачеві
    const convResult = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
      [req.params.conversationId, req.userId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = convResult.rows[0];

    // Отримуємо всі повідомлення
    const msgResult = await pool.query(
      'SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.conversationId]
    );

    const messages = msgResult.rows;

    if (format === 'json') {
      return res.json({ conversation, messages });
    }

    if (format === 'txt') {
      const text = messages
        .map(m => `[${m.role.toUpperCase()}] ${m.content}`)
        .join('\n\n---\n\n');
      return res.json({ content: text, format: 'txt', filename: `conversation-${req.params.conversationId}.txt` });
    }

    // Markdown (default)
    const md = [
      `# ${conversation.title || 'Розмова'}`,
      `> Дата: ${new Date(conversation.created_at).toLocaleString('uk-UA')}`,
      '',
      ...messages.map(m => [
        `## ${m.role === 'user' ? '👤 Ви' : '🤖 Assistant'}`,
        m.content,
        ''
      ].join('\n'))
    ].join('\n');

    return res.json({ content: md, format: 'md', filename: `conversation-${req.params.conversationId}.md` });

  } catch (error) {
    logger.error(`GET /conversations/${req.params.conversationId}/export error: ${error.message}`);
    res.status(500).json({ error: 'Failed to export conversation' });
  }
});

module.exports = router;
