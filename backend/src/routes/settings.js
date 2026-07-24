const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../config/database');
const { validateSettingsUpdate, handleValidationErrors } = require('../validators/settingsValidator');
const logger = require('../logger');

router.get('/', async (req, res) => {
  const defaults = {
    default_model: 'gpt-3.5-turbo',
    temperature: 0.7,
    max_tokens: 2000,
    default_provider: 'openai',
    default_ollama_host: process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/v1/chat/completions'
  };

  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
    } catch (err) {
      logger.warn('Invalid token on settings GET, falling back to defaults');
    }
  }

  try {
    if (req.userId) {
      try {
        const result = await pool.query(
          'SELECT default_model, temperature, max_tokens, default_provider, default_ollama_host FROM user_settings WHERE user_id = $1',
          [req.userId]
        );

        if (result.rows.length === 0) {
          return res.json(defaults);
        }

        return res.json(result.rows[0]);
      } catch (dbError) {
        logger.warn(`Settings GET failed, falling back to defaults: ${dbError.message || dbError}`);
        return res.json(defaults);
      }
    }

    return res.json(defaults);
  } catch (error) {
    logger.error(`Error in GET /settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/', auth, validateSettingsUpdate, handleValidationErrors, async (req, res, next) => {
  const { default_model, temperature, max_tokens, default_provider, default_ollama_host, system_prompt } = req.body;

  try {
    const defaultHost = process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/v1/chat/completions';

    // Додаємо колонку system_prompt якщо ще не існує
    try {
      await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT ''`);
    } catch (mErr) {
      logger.warn(`Could not ensure system_prompt column exists: ${mErr.message || mErr}`);
    }

    try {
      await pool.query(
        `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_ollama_host VARCHAR(255) DEFAULT '${defaultHost.replace("'", "''")}'`
      );
    } catch (mErr) {
      logger.warn(`Could not ensure default_ollama_host column exists: ${mErr.message || mErr}`);
    }

    // Отримуємо поточні налаштування для збереження існуючих значень при частковому оновленні
    const currentRes = await pool.query(
      'SELECT default_model, temperature, max_tokens, default_provider, default_ollama_host, system_prompt FROM user_settings WHERE user_id = $1',
      [req.userId]
    );
    const existing = currentRes.rows[0] || {};

    const updatedModel = default_model || existing.default_model || 'gpt-3.5-turbo';
    const updatedTemp = temperature ?? existing.temperature ?? 0.7;
    const updatedMaxTokens = max_tokens ?? existing.max_tokens ?? 2000;
    const updatedProvider = default_provider || existing.default_provider || 'openai';
    const updatedHost = default_ollama_host || existing.default_ollama_host || defaultHost;
    const updatedPrompt = system_prompt !== undefined ? system_prompt : (existing.system_prompt || '');

    const result = await pool.query(
      `INSERT INTO user_settings (user_id, default_model, temperature, max_tokens, default_provider, default_ollama_host, system_prompt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         default_model = EXCLUDED.default_model,
         temperature = EXCLUDED.temperature,
         max_tokens = EXCLUDED.max_tokens,
         default_provider = EXCLUDED.default_provider,
         default_ollama_host = EXCLUDED.default_ollama_host,
         system_prompt = EXCLUDED.system_prompt,
         updated_at = NOW()
       RETURNING *`,
      [
        req.userId,
        updatedModel,
        updatedTemp,
        updatedMaxTokens,
        updatedProvider,
        updatedHost,
        updatedPrompt
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error(`Error in PUT /settings: ${error.message}`);
    next(error);
  }
});

module.exports = router;
