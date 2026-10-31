import { body, param } from 'express-validator';
import { ALLOWED_PROVIDERS, handleValidationErrors } from './settingsValidator';

export const validateModelCreate = [
  body('name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 255 }),
  body('modelId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('modelId is required')
    .isLength({ max: 255 }),
  body('provider')
    .optional()
    .isIn(ALLOWED_PROVIDERS)
    .withMessage('Invalid provider'),
  body('temperature').optional().isFloat({ min: 0, max: 2 }),
  body('maxTokens').optional().isInt({ min: 100, max: 128000 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  handleValidationErrors,
];

export const validateModelUpdate = [
  param('modelId').isInt({ min: 1 }).withMessage('Invalid model ID'),
  body('name').optional().isString().trim().isLength({ min: 1, max: 255 }),
  body('modelId').optional().isString().trim().isLength({ min: 1, max: 255 }),
  body('provider')
    .optional()
    .isIn(ALLOWED_PROVIDERS)
    .withMessage('Invalid provider'),
  body('temperature').optional().isFloat({ min: 0, max: 2 }),
  body('maxTokens').optional().isInt({ min: 100, max: 128000 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  handleValidationErrors,
];

export const validateModelId = [
  param('modelId').isInt({ min: 1 }).withMessage('Invalid model ID'),
  handleValidationErrors,
];
