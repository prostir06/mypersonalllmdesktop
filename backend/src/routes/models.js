/**
 * @file routes/models.js
 * REST API маршрути для управління LLM моделями та remote model discovery.
 * Дотримується StandardJS / Express best practices.
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const auth = require('../middleware/auth');
const pool = require('../config/database');
const logger = require('../logger');

/**
 * GET /api/models
 * Повертає всі моделі поточного користувача + стандартні моделі
 */
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM llm_models WHERE user_id = $1 OR is_default = true ORDER BY name',
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error(`GET /models error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

/**
 * GET /api/models/remote?provider=ollama&host=<url>
 * Динамічне виявлення моделей з локального сервера (Ollama тощо)
 */
router.get('/remote', async (req, res) => {
  const { provider, host } = req.query;

  if (!provider) {
    return res.status(400).json({ error: 'provider is required' });
  }

  try {
    if ((provider || '').toLowerCase() === 'ollama') {
      const hostUrl = host || process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/v1/chat/completions';

      // Визначаємо origin з URL хоста
      let origin;
      try {
        const u = new URL(hostUrl);
        origin = u.origin;
      } catch (e) {
        // Fallback: відрізаємо шлях вручну
        origin = hostUrl.split('/').slice(0, 3).join('/');
      }

      // Спробуємо декілька можливих ендпоінтів Ollama (включаючи нативний /api/tags та v1/models)
      const candidates = [
        `${origin}/api/tags`,
        `${origin}/v1/models`,
        `${origin}/models`,
        `${origin}/v1/list`,
        `${origin}/v1/engines`
      ];

      let models = null;
      for (const url of candidates) {
        try {
          const r = await axios.get(url, { timeout: 5000 });
          if (r.status === 200 && r.data) {
            const data = r.data.models || r.data.data || r.data || r.data.engines;
            if (Array.isArray(data)) {
              models = data.map((m) => {
                if (typeof m === 'string') return { id: m, name: m };
                const val = m.name || m.id || m.model || m.engine;
                return {
                  id: val,
                  name: val
                };
              });
              break;
            }
          }
        } catch (err) {
          // Пробуємо наступний endpoint
        }
      }

      if (!models) {
        return res.status(502).json({ error: 'Could not fetch models from Ollama host' });
      }

      return res.json(models);
    }

    return res.status(400).json({ error: 'Unsupported provider for remote discovery' });
  } catch (error) {
    logger.error(`GET /models/remote error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch remote models' });
  }
});

/**
 * POST /api/models
 * Додає нову кастомну модель для поточного користувача
 */
router.post('/', auth, async (req, res) => {
  const { name, modelId, description, temperature, maxTokens, provider } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO llm_models (user_id, name, model_id, description, temperature, max_tokens, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.userId, name, modelId, description, temperature || 0.7, maxTokens || 2000, provider || 'openai']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error(`POST /models error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create model' });
  }
});

/**
 * PUT /api/models/:modelId
 * Оновлює налаштування моделі поточного користувача
 */
router.put('/:modelId', auth, async (req, res) => {
  const { name, description, temperature, maxTokens, provider } = req.body;

  try {
    const result = await pool.query(
      `UPDATE llm_models
       SET name = $1, description = $2, temperature = $3, max_tokens = $4, provider = $5
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [name, description, temperature, maxTokens, provider || 'openai', req.params.modelId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error(`PUT /models/${req.params.modelId} error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update model' });
  }
});

/**
 * DELETE /api/models/:modelId
 * Видаляє кастомну модель поточного користувача
 */
router.delete('/:modelId', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM llm_models WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.modelId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`DELETE /models/${req.params.modelId} error: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete model' });
  }
});

module.exports = router;
