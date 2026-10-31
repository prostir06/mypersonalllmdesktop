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

export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 2;
export const MIN_MAX_TOKENS = 100;
export const MAX_MAX_TOKENS = 32000;
export const MAX_API_KEY_LENGTH = 256;

export const ALLOWED_SETTINGS_FIELDS = [
  'default_provider',
  'default_model',
  'default_ollama_host',
  'temperature',
  'max_tokens',
  'system_prompt',
  'openai_api_key',
  'clear_openai_api_key',
  'gemini_api_key',
  'clear_gemini_api_key',
  'anthropic_api_key',
  'clear_anthropic_api_key',
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
    .isFloat({ min: MIN_TEMPERATURE, max: MAX_TEMPERATURE })
    .withMessage(`Temperature must be between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}`),
  body('max_tokens')
    .optional()
    .isInt({ min: MIN_MAX_TOKENS, max: MAX_MAX_TOKENS })
    .withMessage(`Max tokens must be between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}`),
  body('system_prompt')
    .optional()
    .isString()
    .withMessage('System prompt must be a string'),
  body('openai_api_key')
    .optional()
    .isString()
    .isLength({ max: MAX_API_KEY_LENGTH })
    .withMessage('OpenAI API key too long'),
  body('clear_openai_api_key')
    .optional()
    .isBoolean()
    .withMessage('clear_openai_api_key must be boolean'),
  body('gemini_api_key')
    .optional()
    .isString()
    .isLength({ max: MAX_API_KEY_LENGTH })
    .withMessage('Gemini API key too long'),
  body('clear_gemini_api_key')
    .optional()
    .isBoolean()
    .withMessage('clear_gemini_api_key must be boolean'),
  body('anthropic_api_key')
    .optional()
    .isString()
    .isLength({ max: MAX_API_KEY_LENGTH })
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
