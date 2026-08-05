import { Request, Response } from 'express';
import prisma from '../config/prisma';
import logger from '../logger';
import { parseListPagination } from '../utils/listPagination';

type AuthRequest = Request & { userId?: number };

type ConversationRow = {
  id: number;
  userId: number;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function parseConversationId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

export function toListItem(row: {
  id: number;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    title: row.title,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function toPublicConversation(row: ConversationRow) {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function toPublicMessage(row: {
  role: string;
  content: string;
  createdAt: Date;
}) {
  return {
    role: row.role,
    content: row.content,
    created_at: row.createdAt,
  };
}

function resolveTitle(title: unknown): string {
  if (typeof title === 'string' && title.trim() !== '') return title;
  return 'Нова розмова';
}

export async function listConversations(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const { limit, offset } = parseListPagination(req.query);
    const where = { userId: req.userId! };
    const [rows, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        select: { id: true, title: true, createdAt: true, updatedAt: true },
      }),
      prisma.conversation.count({ where }),
    ]);
    res.json({
      items: rows.map(toListItem),
      total,
      limit,
      offset,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /conversations error: ${message}`);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}

export async function getConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const id = parseConversationId(String(req.params.conversationId));
  if (id == null) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  try {
    const row = await prisma.conversation.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!row) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json(toPublicConversation(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`GET /conversations/${req.params.conversationId} error: ${message}`);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
}

export async function createConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const title = resolveTitle((req.body as { title?: unknown })?.title);

  try {
    const row = await prisma.conversation.create({
      data: { userId: req.userId!, title },
    });
    res.status(201).json(toPublicConversation(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /conversations error: ${message}`);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
}

export async function updateConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const id = parseConversationId(String(req.params.conversationId));
  if (id == null) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const title = (req.body as { title?: string })?.title;

  try {
    const existing = await prisma.conversation.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!existing) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const row = await prisma.conversation.update({
      where: { id },
      data: { title },
    });
    res.json(toPublicConversation(row));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`PUT /conversations/${req.params.conversationId} error: ${message}`);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
}

export async function deleteConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const id = parseConversationId(String(req.params.conversationId));
  if (id == null) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  try {
    const result = await prisma.conversation.deleteMany({
      where: { id, userId: req.userId! },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`DELETE /conversations/${req.params.conversationId} error: ${message}`);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
}

export async function exportConversation(
  req: AuthRequest,
  res: Response
): Promise<void> {
  const id = parseConversationId(String(req.params.conversationId));
  if (id == null) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const formatRaw = String(req.query.format || 'md');
  const format = formatRaw === 'json' || formatRaw === 'txt' ? formatRaw : 'md';

  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, createdAt: true },
    });

    if (format === 'json') {
      res.json({
        conversation: toPublicConversation(conversation),
        messages: messages.map(toPublicMessage),
      });
      return;
    }

    if (format === 'txt') {
      const text = messages
        .map((m) => `[${m.role.toUpperCase()}] ${m.content}`)
        .join('\n\n---\n\n');
      res.json({
        content: text,
        format: 'txt',
        filename: `conversation-${id}.txt`,
      });
      return;
    }

    const md = [
      `# ${conversation.title || 'Розмова'}`,
      `> Дата: ${new Date(conversation.createdAt).toLocaleString('uk-UA')}`,
      '',
      ...messages.map((m) =>
        [
          `## ${m.role === 'user' ? '👤 Ви' : '🤖 Assistant'}`,
          m.content,
          '',
        ].join('\n')
      ),
    ].join('\n');

    res.json({
      content: md,
      format: 'md',
      filename: `conversation-${id}.md`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `GET /conversations/${req.params.conversationId}/export error: ${message}`
    );
    res.status(500).json({ error: 'Failed to export conversation' });
  }
}
