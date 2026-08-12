import { body, param } from 'express-validator';
import { handleValidationErrors } from './settingsValidator';

export const validatePromptCreate = [
  body('title')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('title is required')
    .isLength({ max: 255 }),
  body('prompt')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('prompt is required')
    .isLength({ max: 8000 }),
  body('isPinned').optional().isBoolean(),
  body('is_pinned').optional().isBoolean(),
  handleValidationErrors,
];

export const validatePromptUpdate = [
  param('promptId').isInt({ min: 1 }).withMessage('Invalid prompt ID'),
  body('title').optional().isString().trim().notEmpty().isLength({ max: 255 }),
  body('prompt').optional().isString().trim().notEmpty().isLength({ max: 8000 }),
  body('isPinned').optional().isBoolean(),
  body('is_pinned').optional().isBoolean(),
  handleValidationErrors,
];

export const validatePromptId = [
  param('promptId').isInt({ min: 1 }).withMessage('Invalid prompt ID'),
  handleValidationErrors,
];
