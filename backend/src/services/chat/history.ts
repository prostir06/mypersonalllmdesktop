import prisma from '../../config/prisma';
import {
  buildLinearHistory,
  toProviderMessages,
  type RawMessage,
} from '../conversationHistory';

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
    },
  }) as unknown as Promise<RawMessage[]>;
}
