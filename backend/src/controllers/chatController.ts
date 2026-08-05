/**
 * Thin HTTP/SSE adapters over ChatService. Rate limits stay in server.js.
 * Controllers catch ChatError → 4xx JSON; unexpected errors → 500 (or SSE error).
 */
import { Request, Response, NextFunction } from 'express';
import ChatService = require('../services/ChatService');
import logger from '../logger';

type AuthRequest = Request & { userId?: number };

function isChatError(error: unknown): error is Error & { statusCode: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  );
}

/** Write one SSE frame; ignore client disconnect so the handler can finish cleanly. */
function writeSse(res: Response, payload: unknown): void {
  try {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`SSE write skipped (client closed?): ${message}`);
  }
}

function validateChatMessage(
  message: unknown,
  res: Response
): message is string {
  if (!message || !String(message).trim()) {
    res.status(400).json({ error: 'Message is required' });
    return false;
  }
  if (String(message).length > 4000) {
    res.status(400).json({ error: 'Message too long (max 4000 characters)' });
    return false;
  }
  return true;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Public JSON body — never leak internals in production. */
function publicErrorJson(
  publicError: string,
  details: string
): { error: string; details?: string } {
  if (isProduction()) return { error: publicError };
  return { error: publicError, details };
}

function publicStreamErrorText(details: string): string {
  return isProduction() ? 'Stream failed' : details;
}

export async function sendMessage(
  req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const { conversationId, message, model, provider, options = {} } = req.body;

    if (!validateChatMessage(message, res)) return;

    const result = await ChatService.sendMessage({
      userId: req.userId!,
      conversationId,
      message,
      model,
      provider,
      options,
    });
    res.json(result);
  } catch (error: unknown) {
    if (isChatError(error)) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in sendMessage: ${message}`);
    res
      .status(500)
      .json(publicErrorJson('Failed to send message', message));
  }
}

export async function streamMessage(
  req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const { conversationId, message, model, provider, options = {} } = req.body;

    if (!validateChatMessage(message, res)) return;

    // Tools disabled on SSE path (interactive tools need a non-stream round-trip)
    const streamOptions = {
      ...(options || {}),
      tools: undefined,
      enableTools: false,
    };

    const result = await ChatService.streamMessage(
      {
        userId: req.userId!,
        conversationId,
        message,
        model,
        provider,
        options: streamOptions,
      },
      (token: string) => {
        writeSse(res, { type: 'token', token });
      },
      (convId: number) => {
        // Headers after ownership/prep so 403 stays JSON (not half-open SSE)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        writeSse(res, { type: 'init', conversationId: convId });
      }
    );

    writeSse(res, {
      type: 'done',
      messageId: result.messageId,
      content: result.content,
    });
    res.end();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in streamMessage: ${message}`);
    if (isChatError(error) && !res.headersSent) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (!res.headersSent) {
      res
        .status(500)
        .json(publicErrorJson('Failed to stream message', message));
    } else {
      writeSse(res, { type: 'error', error: publicStreamErrorText(message) });
      res.end();
    }
  }
}

export async function getHistory(
  req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const conversationId = Number(req.params.conversationId);
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset), 10) || 0, 0);

    const result = await ChatService.getHistory(
      req.userId!,
      conversationId,
      limit,
      offset
    );
    res.json(result);
  } catch (error: unknown) {
    if (isChatError(error)) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in getHistory: ${message}`);
    res
      .status(500)
      .json(
        publicErrorJson('Failed to fetch conversation history', message)
      );
  }
}

export async function searchMessages(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const { q, conversationId } = req.query;
  if (!q || String(q).trim().length < 2) {
    res
      .status(400)
      .json({ error: 'Пошуковий запит має бути не менше 2 символів' });
    return;
  }

  try {
    const result = await ChatService.searchMessages(
      req.userId!,
      String(q),
      conversationId !== undefined ? String(conversationId) : undefined
    );
    res.json(result);
  } catch (error: unknown) {
    if (isChatError(error)) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /chat/search error: ${message}`);
    res.status(500).json({ error: 'Помилка пошуку' });
  }
}
