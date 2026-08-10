/**
 * express-validator rules for settings updates.
 */
import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { assertAllowedHttpUrl } from '../utils/urlAllowlist';

export const validateSettingsUpdate = [
  body('default_provider')
    .optional()
    .isIn(['openai', 'ollama'])
    .withMessage('Invalid provider'),
  body('default_model')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('Model must be between 1 and 255 characters'),
  body('default_ollama_host')
    .optional({ values: 'falsy' })
    .isURL({ require_tld: false, allow_underscores: true })
    .withMessage('Invalid Ollama URL')
    .custom((value: string) => {
      assertAllowedHttpUrl(value);
      return true;
    }),
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
  body('openai_api_key')
    .optional()
    .isString()
    .isLength({ max: 256 })
    .withMessage('OpenAI API key too long'),
  body('clear_openai_api_key')
    .optional()
    .isBoolean()
    .withMessage('clear_openai_api_key must be boolean'),
];

export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
