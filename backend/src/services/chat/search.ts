import prisma from '../../config/prisma';
import logger from '../../logger';
import { buildMessageFtsQuery } from '../../utils/messageFts';
import { ChatError } from './types';

type FtsRow = {
  id: number;
  role: string;
  content: string;
  created_at: Date;
  conversation_id: number;
  conversation_title: string | null;
};

function parseConversationId(conversationId?: number | string): number | null {
  if (conversationId === undefined || conversationId === '') {
    return null;
  }

  const parsed = Number(conversationId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ChatError(400, 'Invalid conversationId');
  }
  return parsed;
}

export async function searchMessages(
  userId: number,
  q: string,
  conversationId?: number | string
) {
  const trimmed = q.trim();
  const cid = parseConversationId(conversationId);

  try {
    const rows = await prisma.$queryRaw<FtsRow[]>(
      buildMessageFtsQuery(userId, trimmed, cid)
    );

    return {
      results: rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        conversation_id: m.conversation_id,
        conversation_title: m.conversation_title,
      })),
      total: rows.length,
    };
  } catch (err: unknown) {
    if (err instanceof ChatError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`searchMessages failed for user ${userId}: ${message}`);
    throw err;
  }
}
