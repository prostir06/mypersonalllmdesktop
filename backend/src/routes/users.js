/**
 * @file routes/users.js
 * REST API для профілю поточного користувача.
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../config/database');
const logger = require('../logger');

/**
 * GET /api/users/me
 * Повертає дані профілю поточного авторизованого користувача
 */
router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error(`GET /users/me error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * PUT /api/users/me
 * Оновлює ім'я та email поточного користувача
 */
router.put('/me', auth, async (req, res) => {
  const { name, email } = req.body;

  try {
    const result = await pool.query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email',
      [name, email, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error(`PUT /users/me error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

module.exports = router;
