import { body, param, query } from 'express-validator';
import { handleValidationErrors } from './settingsValidator';

export const validateChatSend = [
  body('message')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ max: 4000 })
    .withMessage('Message too long (max 4000 characters)'),
  body('model').optional().isString().isLength({ max: 255 }),
  body('provider')
    .optional()
    .isIn(['openai', 'ollama'])
    .withMessage('Invalid provider'),
  body('conversationId').optional({ nullable: true }),
  body('options.regenerateFromMessageId').optional().isInt({ min: 1 }),
  body('options.attachments').optional().isArray({ max: 5 }),
  handleValidationErrors,
];

export const validateChatHistory = [
  param('conversationId')
    .isInt({ min: 1 })
    .withMessage('Invalid conversation ID'),
  handleValidationErrors,
];

export const validateChatSearch = [
  query('q')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ max: 500 }),
  query('conversationId').optional().isInt({ min: 1 }),
  handleValidationErrors,
];
