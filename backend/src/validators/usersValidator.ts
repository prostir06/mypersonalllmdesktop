import { body } from 'express-validator';
import { handleValidationErrors } from './settingsValidator';

export const validateUserUpdate = [
  body('name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 255 }),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required')
    .isLength({ max: 255 }),
  body('currentPassword').optional().isString(),
  handleValidationErrors,
];
