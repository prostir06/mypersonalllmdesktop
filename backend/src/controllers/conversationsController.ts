import { Response } from 'express';
import logger from '../logger';
import { parseListPagination } from '../utils/listPagination';
import { jsonError } from '../utils/httpJson';
import type { AuthRequest } from '../types/express';
import * as ConversationsService from '../services/conversationsService';

export const parseConversationId = ConversationsService.parseConversationId;
export const toListItem = ConversationsService.toListItem;
export const toPublicConversation = ConversationsService.toPublicConversation;
export const toPublicMessage = ConversationsService.toPublicMessage;

export async function listConversations(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const { limit, offset } = parseListPagination(req.query);
    const { rows, total } = await ConversationsService.listForUser(
      req.userId!,
      limit,
      offset
    );
    res.json({
      items: rows.map(ConversationsService.toListItem),
      total,
      limit,
      offset,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /conversations error: ${message}`);
    jsonError(res, req, 500, 'Failed to fetch conversations');
  }
}

export async function getConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const id = ConversationsService.parseConversationId(
    String(req.params.conversationId)
  );
  if (id == null) {
    jsonError(res, req, 404, 'Conversation not found');
    return;
  }

  try {
    const row = await ConversationsService.getForUser(req.userId!, id);
    if (!row) {
      jsonError(res, req, 404, 'Conversation not found');
      return;
    }
    res.json(ConversationsService.toPublicConversation(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `GET /conversations/${req.params.conversationId} error: ${message}`
    );
    jsonError(res, req, 500, 'Failed to fetch conversation');
  }
}

export async function createConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const title = ConversationsService.resolveTitle(
    (req.body as { title?: unknown })?.title
  );

  try {
    const row = await ConversationsService.createForUser(req.userId!, title);
    res.status(201).json(ConversationsService.toPublicConversation(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /conversations error: ${message}`);
    jsonError(res, req, 500, 'Failed to create conversation');
  }
}

export async function updateConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const id = ConversationsService.parseConversationId(
    String(req.params.conversationId)
  );
  if (id == null) {
    jsonError(res, req, 404, 'Conversation not found');
    return;
  }

  const title = (req.body as { title?: string })?.title;

  try {
    const row = await ConversationsService.updateTitleForUser(
      req.userId!,
      id,
      title
    );
    if (!row) {
      jsonError(res, req, 404, 'Conversation not found');
      return;
    }
    res.json(ConversationsService.toPublicConversation(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `PUT /conversations/${req.params.conversationId} error: ${message}`
    );
    jsonError(res, req, 500, 'Failed to update conversation');
  }
}

export async function togglePinConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const id = ConversationsService.parseConversationId(
    String(req.params.conversationId)
  );
  if (id == null) {
    jsonError(res, req, 404, 'Conversation not found');
    return;
  }

  const rawPinned = (req.body as { is_pinned?: unknown })?.is_pinned;
  const isPinned = typeof rawPinned === 'boolean' ? rawPinned : undefined;

  try {
    const updated = await ConversationsService.togglePinForUser(
      req.userId!,
      id,
      isPinned
    );
    if (!updated) {
      jsonError(res, req, 404, 'Conversation not found');
      return;
    }
    res.json(ConversationsService.toListItem(updated));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `PATCH /conversations/${req.params.conversationId}/pin error: ${message}`
    );
    jsonError(res, req, 500, 'Failed to update conversation pin');
  }
}

export async function deleteConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const id = ConversationsService.parseConversationId(
    String(req.params.conversationId)
  );
  if (id == null) {
    jsonError(res, req, 404, 'Conversation not found');
    return;
  }

  try {
    const result = await ConversationsService.deleteForUser(req.userId!, id);
    if (result.count === 0) {
      jsonError(res, req, 404, 'Conversation not found');
      return;
    }
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `DELETE /conversations/${req.params.conversationId} error: ${message}`
    );
    jsonError(res, req, 500, 'Failed to delete conversation');
  }
}

export async function exportConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const id = ConversationsService.parseConversationId(
    String(req.params.conversationId)
  );
  if (id == null) {
    jsonError(res, req, 404, 'Conversation not found');
    return;
  }

  const formatRaw = String(req.query.format || 'md');
  const format: ConversationsService.ExportFormat =
    formatRaw === 'json' || formatRaw === 'txt' ? formatRaw : 'md';

  try {
    const bundle = await ConversationsService.loadExportBundle(req.userId!, id);
    if (!bundle) {
      jsonError(res, req, 404, 'Conversation not found');
      return;
    }
    res.json(
      ConversationsService.formatExport(
        format,
        bundle.conversation,
        bundle.messages
      )
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `GET /conversations/${req.params.conversationId}/export error: ${message}`
    );
    jsonError(res, req, 500, 'Failed to export conversation');
  }
}
