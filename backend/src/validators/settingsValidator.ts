/**
 * express-validator rules for settings updates.
 */
import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { assertAllowedHttpUrl } from '../utils/urlAllowlist';
import { jsonValidationErrors } from '../utils/httpJson';

export const ALLOWED_PROVIDERS = [
  'openai',
  'ollama',
  'gemini',
  'anthropic',
] as const;

export const validateSettingsUpdate = [
  body('default_provider')
    .optional()
    .isIn(ALLOWED_PROVIDERS)
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
    .isInt({ min: 100, max: 32000 })
    .withMessage('Max tokens must be between 100 and 32000'),
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
  body('gemini_api_key')
    .optional()
    .isString()
    .isLength({ max: 256 })
    .withMessage('Gemini API key too long'),
  body('clear_gemini_api_key')
    .optional()
    .isBoolean()
    .withMessage('clear_gemini_api_key must be boolean'),
  body('anthropic_api_key')
    .optional()
    .isString()
    .isLength({ max: 256 })
    .withMessage('Anthropic API key too long'),
  body('clear_anthropic_api_key')
    .optional()
    .isBoolean()
    .withMessage('clear_anthropic_api_key must be boolean'),
];

export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      jsonValidationErrors(res, req, errors.array());
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
