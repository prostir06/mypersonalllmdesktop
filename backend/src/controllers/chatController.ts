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

export async function sendMessage(
  req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const { conversationId, message, model, provider, options = {} } = req.body;

    if (!message || !String(message).trim()) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    if (String(message).length > 4000) {
      res.status(400).json({ error: 'Message too long (max 4000 characters)' });
      return;
    }

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
    res.status(500).json({ error: 'Failed to send message', details: message });
  }
}

export async function streamMessage(
  req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const { conversationId, message, model, provider, options = {} } = req.body;

    if (!message || !String(message).trim()) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    if (String(message).length > 4000) {
      res.status(400).json({ error: 'Message too long (max 4000 characters)' });
      return;
    }

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
        res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
      },
      (convId: number) => {
        // Headers after ownership/prep so 403 stays JSON
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write(
          `data: ${JSON.stringify({ type: 'init', conversationId: convId })}\n\n`
        );
      }
    );

    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        messageId: result.messageId,
        content: result.content,
      })}\n\n`
    );
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
        .json({ error: 'Failed to stream message', details: message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
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
      .json({ error: 'Failed to fetch conversation history', details: message });
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
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /chat/search error: ${message}`);
    res.status(500).json({ error: 'Помилка пошуку' });
  }
}
