import prisma from '../../config/prisma';
import logger from '../../logger';
import {
  buildLinearHistory,
  toProviderMessages,
  type RawMessage,
} from '../conversationHistory';
import { ChatError } from './types';

/** Newest 50 linear turns (branch-aware), oldest->newest for the provider. */
export async function loadRecentMessages(
  conversationId: number,
  activeBranchIds?: Record<number, number>
): Promise<Array<{ role: string; content: string }>> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      parentId: true,
      createdAt: true,
      sources: true,
    },
  });
  const linear = buildLinearHistory(rows as unknown as RawMessage[], activeBranchIds);
  return toProviderMessages(linear, 50);
}

export async function loadAllRawMessages(
  conversationId: number
): Promise<RawMessage[]> {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      parentId: true,
      createdAt: true,
      sources: true,
    },
  }) as unknown as Promise<RawMessage[]>;
}

export async function getHistory(
  userId: number,
  conversationId: number,
  limit: number,
  offset: number
) {
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    throw new ChatError(404, 'Conversation not found');
  }

  try {
    const owned = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new ChatError(404, 'Conversation not found');
    }

    const allRows = await loadAllRawMessages(conversationId);
    const linear = buildLinearHistory(allRows);
    const total = linear.length;
    const page = linear.slice(offset, offset + limit);

    return {
      messages: page.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.createdAt,
        parent_id: m.parentId ?? undefined,
        sources: m.sources,
        branches: m.branches?.map((b) => ({
          id: b.id,
          content: b.content,
          created_at: b.created_at,
          sources: b.sources,
        })),
        branch_index: m.branchIndex,
      })),
      total,
      limit,
      offset,
    };
  } catch (err: unknown) {
    if (err instanceof ChatError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`getHistory failed for user ${userId}: ${message}`);
    throw err;
  }
}
