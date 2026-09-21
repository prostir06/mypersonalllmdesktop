import { Response } from 'express';
import logger from '../../logger';
import { jsonError } from '../../utils/httpJson';
import { UrlNotAllowedError } from '../../utils/urlAllowlist';
import type { AuthRequest } from '../../types/express';

export function parseDocumentId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

export function requireDocumentId(
  req: AuthRequest,
  res: Response
): number | null {
  const id = parseDocumentId(String(req.params.id));
  if (id == null) {
    jsonError(res, req, 400, 'Некоректний ідентифікатор документа');
    return null;
  }
  return id;
}

export async function withDocErrors(
  req: AuthRequest,
  res: Response,
  logLabel: string,
  public500: string,
  run: () => Promise<void>
): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`${logLabel}: ${message}`);
    jsonError(res, req, 500, public500);
  }
}

export function publicUploadError(
  isProd: boolean,
  publicError: string,
  details: string
): string {
  if (isProd) return publicError;
  return `${publicError}: ${details}`;
}

export function classifyReindexError(error: unknown): {
  status: 400 | 409 | 500;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof UrlNotAllowedError) {
    return { status: 400, message };
  }
  if (
    message.includes('провайдера embeddings') ||
    message.includes('фрагментів для переіндексації') ||
    message.includes('Не вдалося згенерувати embeddings')
  ) {
    return { status: 409, message };
  }
  return { status: 500, message: 'Не вдалося переіндексувати документ' };
}

export function classifyRetryError(message: string): {
  status: 409 | 500;
  message: string;
} {
  if (message.includes('повторної індексації')) {
    return { status: 409, message };
  }
  return { status: 500, message: 'Не вдалося повторити індексацію' };
}
