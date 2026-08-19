import { ChatError } from './types';

function getPrisma(): typeof import('../../config/prisma').default {
  return require('../../config/prisma').default;
}

/** Keep only positive integers so RAG filters cannot pass junk into SQL ANY(). */
export function sanitizeDocumentIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export function conversationTitle(message: string): string {
  return message.substring(0, 50) + (message.length > 50 ? '...' : '');
}

const PLACEHOLDER_TITLES = new Set(['нова розмова', 'новий чат']);

export function isPlaceholderTitle(title: string | null | undefined): boolean {
  if (title == null) return true;
  const trimmed = title.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_TITLES.has(trimmed.toLowerCase());
}

export async function ensureConversationId(
  userId: number,
  conversationId: number | undefined,
  message: string
): Promise<number> {
  const prisma = getPrisma();

  if (conversationId == null) {
    const created = await prisma.conversation.create({
      data: { userId, title: conversationTitle(message) },
    });
    return created.id;
  }

  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    throw new ChatError(404, 'Conversation not found');
  }

  const owned = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new ChatError(403, 'Forbidden');
  }
  return owned.id;
}
