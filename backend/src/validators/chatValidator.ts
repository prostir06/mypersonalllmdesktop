import { body, param, query } from 'express-validator';
import { ALLOWED_PROVIDERS, handleValidationErrors } from './settingsValidator';

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
    .isIn(ALLOWED_PROVIDERS)
    .withMessage('Invalid provider'),
  body('conversationId').optional({ nullable: true }),
  body('options.regenerateFromMessageId').optional().isInt({ min: 1 }),
  body('options.attachments').optional().isArray({ max: 5 }),
  body('options.attachments').custom((value: unknown) => {
    if (value == null) return true;
    if (!Array.isArray(value)) throw new Error('attachments must be an array');
    let total = 0;
    for (const item of value) {
      const content = (item as { content?: unknown })?.content;
      if (typeof content !== 'string') continue;
      if (content.length > 12_000) {
        throw new Error('Attachment content exceeds 12000 characters');
      }
      total += content.length;
    }
    if (total > 60_000) throw new Error('Attachments exceed 60000 characters in total');
    return true;
  }),
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
