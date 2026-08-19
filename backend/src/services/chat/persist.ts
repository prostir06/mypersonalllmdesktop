import prisma from '../../config/prisma';
import logger from '../../logger';
import { conversationTitle, isPlaceholderTitle } from './ownership';
import type { RagSource } from './types';

export async function persistTurn(
  conversationId: number,
  userContent: string,
  assistantContent: string,
  opts: {
    regenerateFromMessageId?: number;
    skipUserMessage?: boolean;
    sources?: RagSource[];
  } = {}
): Promise<{ id: number; createdAt: Date }> {
  const { sources } = opts;
  try {
    return await prisma.$transaction(async (tx) => {
      let userMessageId = opts.regenerateFromMessageId;

      if (!opts.skipUserMessage) {
        const userMsg = await tx.message.create({
          data: { conversationId, role: 'user', content: userContent },
        });
        userMessageId = userMsg.id;
      }

      const assistant = await tx.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: assistantContent,
          ...(sources?.length ? { sources } : {}),
          ...(userMessageId != null ? { parentId: userMessageId } : {}),
        },
      });

      const conv = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: { title: true },
      });
      const shouldTitle =
        !opts.skipUserMessage && isPlaceholderTitle(conv?.title);
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: new Date(),
          ...(shouldTitle ? { title: conversationTitle(userContent) } : {}),
        },
      });
      return assistant;
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`persistTurn failed for conversation ${conversationId}: ${message}`);
    throw err;
  }
}
