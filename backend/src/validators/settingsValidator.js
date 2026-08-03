/**
 * @file settingsValidator.js
 * Валідаційні схеми express-validator для автентифікації та налаштувань.
 * Дотримується концепцій StandardJS / Clean Code.
 */

const { body, validationResult } = require('express-validator');

/**
 * Валідація оновлення глобальних налаштувань AI
 */
const validateSettingsUpdate = [
  body('default_provider')
    .optional()
    .isIn(['openai', 'ollama', 'chatgpt', 'gpt', 'copilot', 'microsoft', 'google'])
    .withMessage('Invalid provider'),
  body('default_model')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('Model must be between 1 and 255 characters'),
  body('default_ollama_host')
    .optional({ values: 'falsy' })
    .isURL({ require_tld: false, allow_underscores: true })
    .withMessage('Invalid Ollama URL'),
  body('temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be between 0 and 2'),
  body('max_tokens')
    .optional()
    .isInt({ min: 100, max: 4000 })
    .withMessage('Max tokens must be between 100 and 4000'),
  body('system_prompt')
    .optional()
    .isString()
    .withMessage('System prompt must be a string'),
];

/**
 * Валідація реєстрації нового користувача
 */
const validateAuthRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('password')
    .isLength({ min: 8 })
    .matches(/[a-z]/)
    .matches(/[A-Z]/)
    .matches(/[0-9]/)
    .withMessage('Password must contain uppercase, lowercase, and numbers'),
  body('name')
    .trim()
    .notEmpty()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
];

/**
 * Валідація входу в систему (логин)
 */
const validateAuthLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

/**
 * Middleware для перевірки та повернення помилок валідації
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
const handleValidationErrors = (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateSettingsUpdate,
  validateAuthRegister,
  validateAuthLogin,
  handleValidationErrors,
};
