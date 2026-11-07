import { Response } from 'express';
import { jsonError } from '../../utils/httpJson';
import { QUOTA_EXCEEDED_MESSAGE } from '../usage/sharedKeys';
import type { AuthRequest } from '../../types/express';

export function isChatError(
  error: unknown
): error is Error & { statusCode: number; code?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  );
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function validateChatMessage(
  message: unknown,
  req: AuthRequest,
  res: Response
): message is string {
  if (!message || !String(message).trim()) {
    jsonError(res, req, 400, 'Message is required');
    return false;
  }
  if (String(message).length > 4000) {
    jsonError(res, req, 400, 'Message too long (max 4000 characters)');
    return false;
  }
  return true;
}

/** Public JSON body — never leak internals in production. */
export function publicErrorJson(
  req: { id?: string },
  publicError: string,
  details: string
): { error: string; requestId?: string; details?: string } {
  const base: { error: string; requestId?: string; details?: string } = {
    error: publicError,
    requestId: req.id,
  };
  if (!isProduction()) base.details = details;
  return base;
}

export function publicStreamErrorText(details: string): string {
  if (details === QUOTA_EXCEEDED_MESSAGE) return details;
  return isProduction() ? 'Stream failed' : details;
}
