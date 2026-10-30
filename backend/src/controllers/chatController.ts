/**
 * Thin HTTP/SSE adapters over ChatService. Rate limits stay in server.js.
 */
import { Response, NextFunction } from 'express';
import ChatService from '../services/ChatService';
import logger from '../logger';
import {
  bindClientAbortSignal,
  isAbortError,
} from '../utils/requestAbort';
import { jsonError } from '../utils/httpJson';
import { writeSse, writeSseEvent } from '../utils/sse';
import {
  isChatError,
  validateChatMessage,
  publicErrorJson,
  publicStreamErrorText,
} from '../services/chat/httpHelpers';
import type { AuthRequest } from '../types/express';

function respondChatError(
  req: AuthRequest,
  res: Response,
  error: unknown,
  public500: string
): void {
  if (isChatError(error)) {
    jsonError(res, req, error.statusCode, error.message);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`${public500}: ${message} requestId=${req.id || '-'}`);
  res.status(500).json(publicErrorJson(req, public500, message));
}

export async function sendMessage(
  req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const { conversationId, message, model, provider, options = {} } = req.body;
    if (!validateChatMessage(message, req, res)) return;
    const enableWebSearch =
      req.body.enableWebSearch !== undefined
        ? req.body.enableWebSearch
        : options?.enableWebSearch;
    const safeOptions = {
      ...options,
      ...(enableWebSearch !== undefined ? { enableWebSearch: Boolean(enableWebSearch) } : {}),
      enableTools: false,
      requestId: req.id,
    };
    const result = await ChatService.sendMessage({
      userId: req.userId!,
      conversationId,
      message,
      model,
      provider,
      options: safeOptions,
    });
    res.json(result);
  } catch (error: unknown) {
    respondChatError(req, res, error, 'Failed to send message');
  }
}

export async function streamMessage(
  req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const signal = bindClientAbortSignal(req, res);
  try {
    const { conversationId, message, model, provider, options = {} } = req.body;
    if (!validateChatMessage(message, req, res)) return;
    const enableWebSearch =
      req.body.enableWebSearch !== undefined
        ? req.body.enableWebSearch
        : options?.enableWebSearch;
    const streamOptions = {
      ...(options || {}),
      ...(enableWebSearch !== undefined ? { enableWebSearch: Boolean(enableWebSearch) } : {}),
      tools: undefined,
      enableTools: false,
      requestId: req.id,
    };
    let tokenUsageEmitted = false;
    const result = await ChatService.streamMessage(
      {
        userId: req.userId!,
        conversationId,
        message,
        model,
        provider,
        options: streamOptions,
        signal,
        res: {
          write: (chunk: string) => {
            tokenUsageEmitted = true;
            return res.write(chunk);
          },
        },
      },
      (token: string) => {
        writeSse(res, { type: 'token', token });
      },
      (convId: number, ragStatus?: string) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        writeSse(res, {
          type: 'init',
          conversationId: convId,
          ...(ragStatus ? { ragStatus } : {}),
        });
      }
    );
    if (result.tokenUsage && !tokenUsageEmitted) {
      writeSseEvent(res, 'token_usage', result.tokenUsage);
    }
    writeSse(res, {
      type: 'done',
      messageId: result.messageId,
      content: result.content,
      sources: result.sources,
      ...(result.ragStatus ? { ragStatus: result.ragStatus } : {}),
    });
    res.end();
  } catch (error: unknown) {
    if (isAbortError(error)) {
      if (!res.writableEnded) res.end();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in streamMessage: ${message} requestId=${req.id || '-'}`);
    if (isChatError(error) && !res.headersSent) {
      jsonError(res, req, error.statusCode, error.message);
      return;
    }
    if (!res.headersSent) {
      res
        .status(500)
        .json(publicErrorJson(req, 'Failed to stream message', message));
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
    res.json(
      await ChatService.getHistory(req.userId!, conversationId, limit, offset)
    );
  } catch (error: unknown) {
    respondChatError(req, res, error, 'Failed to fetch conversation history');
  }
}

export async function searchMessages(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const { q, conversationId } = req.query;
  if (!q || String(q).trim().length < 2) {
    jsonError(res, req, 400, 'Пошуковий запит має бути не менше 2 символів');
    return;
  }
  try {
    res.json(
      await ChatService.searchMessages(
        req.userId!,
        String(q),
        conversationId !== undefined ? String(conversationId) : undefined
      )
    );
  } catch (error: unknown) {
    if (isChatError(error)) {
      jsonError(res, req, error.statusCode, error.message);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /chat/search error: ${message} requestId=${req.id || '-'}`);
    jsonError(res, req, 500, 'Помилка пошуку');
  }
}
