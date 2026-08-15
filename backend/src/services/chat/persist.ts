import prisma from '../../config/prisma';
import logger from '../../logger';

export async function persistTurn(
  conversationId: number,
  userContent: string,
  assistantContent: string,
  opts: {
    regenerateFromMessageId?: number;
    skipUserMessage?: boolean;
  } = {}
): Promise<{ id: number; createdAt: Date }> {
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
          ...(userMessageId != null ? { parentId: userMessageId } : {}),
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      return assistant;
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`persistTurn failed for conversation ${conversationId}: ${message}`);
    throw err;
  }
}
