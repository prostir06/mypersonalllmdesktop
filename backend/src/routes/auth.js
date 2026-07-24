/**
 * @file routes/auth.js
 * Маршрути автентифікації: реєстрація та вхід.
 * Валідація паролю: мін. 8 символів, одна велика літера, одна цифра.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const logger = require('../logger');

/**
 * POST /api/auth/register
 * Реєстрація нового користувача.
 * Вимоги: email, ім'я, пароль (8+ символів, велика літера, цифра).
 */
router.post('/register', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Невалідна email адреса'),
  body('name')
    .trim()
    .notEmpty()
    .isLength({ min: 2, max: 255 })
    .withMessage("Ім'я має бути від 2 до 255 символів"),
  body('password')
    .isLength({ min: 8 })
    .matches(/[A-Z]/)
    .matches(/[0-9]/)
    .withMessage('Пароль: мін. 8 символів, одна велика літера та одна цифра')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, name } = req.body;

  try {
    // Перевіряємо чи існує користувач з таким email
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Користувач з таким email вже існує' });
    }

    // Хешуємо пароль перед збереженням
    const hashedPassword = await bcrypt.hash(password, 12);

    // Створюємо нового користувача
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id',
      [name, email, hashedPassword]
    );

    const userId = result.rows[0].id;
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '7d'
    });

    logger.info(`New user registered: ${email} (id=${userId})`);
    res.status(201).json({ token, userId });
  } catch (error) {
    logger.error(`POST /auth/register error: ${error.message}`);
    res.status(500).json({ error: 'Помилка сервера при реєстрації' });
  }
});

/**
 * POST /api/auth/login
 * Вхід до системи. Повертає JWT токен при успіху.
 */
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Невалідна email адреса'),
  body('password')
    .notEmpty()
    .withMessage('Пароль є обов\'язковим')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // Однакова помилка для безпеки (не розкриваємо чи існує email)
      return res.status(400).json({ error: 'Невірний email або пароль' });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Невірний email або пароль' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '7d'
    });

    logger.info(`User logged in: ${email} (id=${user.id})`);
    res.json({ token, userId: user.id });
  } catch (error) {
    logger.error(`POST /auth/login error: ${error.message}`);
    res.status(500).json({ error: 'Помилка сервера при вході' });
  }
});

/**
 * POST /api/auth/refresh
 * Оновлення access токена (якщо переданий токен валідний).
 * Простий stateless refresh — для повноцінного refresh token потрібне окреме поле в БД.
 */
router.post('/refresh', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Токен відсутній' });
    }

    // Верифікуємо і декодуємо (ignoring expiry to allow refresh)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });

    // Перевіряємо чи користувач ще існує
    const result = await pool.query('SELECT id FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Користувача не знайдено' });
    }

    const newToken = jwt.sign({ userId: decoded.userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '7d'
    });

    res.json({ token: newToken });
  } catch (error) {
    logger.error(`POST /auth/refresh error: ${error.message}`);
    res.status(401).json({ error: 'Невалідний токен' });
  }
});

module.exports = router;
