import prisma from '../config/prisma';

type ConversationRow = {
  id: number;
  userId: number;
  title: string | null;
  isPinned?: boolean;
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
  isPinned?: boolean;
}) {
  return {
    id: row.id,
    title: row.title,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    is_pinned: Boolean(row.isPinned),
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

export function resolveTitle(title: unknown): string {
  if (typeof title === 'string' && title.trim() !== '') return title;
  return 'Нова розмова';
}

export async function listForUser(userId: number, limit: number, offset: number) {
  const where = { userId };
  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        isPinned: true,
      },
    }),
    prisma.conversation.count({ where }),
  ]);
  return { rows, total };
}

export async function getForUser(userId: number, id: number) {
  return prisma.conversation.findFirst({ where: { id, userId } });
}

export async function createForUser(userId: number, title: string) {
  return prisma.conversation.create({ data: { userId, title } });
}

export async function updateTitleForUser(
  userId: number,
  id: number,
  title: string | undefined
) {
  const existing = await prisma.conversation.findFirst({
    where: { id, userId },
  });
  if (!existing) return null;
  return prisma.conversation.update({ where: { id }, data: { title } });
}

export async function togglePinForUser(
  userId: number,
  id: number,
  isPinned?: boolean
) {
  const existing = await prisma.conversation.findFirst({
    where: { id, userId },
  });
  if (!existing) return null;
  const nextPinned =
    typeof isPinned === 'boolean' ? isPinned : !existing.isPinned;
  return prisma.conversation.update({
    where: { id },
    data: { isPinned: nextPinned },
  });
}

export async function deleteForUser(userId: number, id: number) {
  return prisma.conversation.deleteMany({ where: { id, userId } });
}

export type ExportFormat = 'json' | 'txt' | 'md';

export async function loadExportBundle(userId: number, id: number) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId },
  });
  if (!conversation) return null;
  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, createdAt: true },
  });
  return { conversation, messages };
}

export function formatExport(
  format: ExportFormat,
  conversation: ConversationRow,
  messages: Array<{ role: string; content: string; createdAt: Date }>
) {
  if (format === 'json') {
    return {
      conversation: toPublicConversation(conversation),
      messages: messages.map(toPublicMessage),
    };
  }

  if (format === 'txt') {
    const text = messages
      .map((m) => `[${m.role.toUpperCase()}] ${m.content}`)
      .join('\n\n---\n\n');
    return {
      content: text,
      format: 'txt' as const,
      filename: `conversation-${conversation.id}.txt`,
    };
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

  return {
    content: md,
    format: 'md' as const,
    filename: `conversation-${conversation.id}.md`,
  };
}
