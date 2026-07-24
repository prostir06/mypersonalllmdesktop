/**
 * @file config/database.js
 * Конфігурація пулу підключень до PostgreSQL.
 * Використовує змінні середовища для підключення.
 * При помилці пулу — логує, але НЕ завершує процес (graceful handling).
 */

const { Pool } = require('pg');
const logger = require('../logger');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'llm_assistant',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  // Налаштування пулу для production
  max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Обробник помилок idle-клієнта.
 * Логуємо помилку, але НЕ виходимо з процесу — тимчасові збої БД не мають вбивати сервер.
 */
pool.on('error', (err, client) => {
  logger.error(`Unexpected DB pool error on idle client: ${err.message}`);
  // Не викликаємо process.exit — дозволяємо pg перепідключитись автоматично
});

pool.on('connect', () => {
  logger.info('New DB client connected to pool');
});

module.exports = pool;
