import prisma from '../../config/prisma';
import logger from '../../logger';
import { conversationTitle, isPlaceholderTitle } from './ownership';
import type { RagSource, TokenUsage } from './types';
import type { Prisma, Message } from '@prisma/client';

export async function persistTurn(
  conversationId: number,
  userContent: string,
  assistantContent: string,
  opts: {
    regenerateFromMessageId?: number;
    skipUserMessage?: boolean;
    sources?: RagSource[];
    tokenUsage?: TokenUsage;
  } = {}
): Promise<{ id: number; createdAt: Date }> {
  const { sources, tokenUsage } = opts;
  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
          ...(tokenUsage ? { tokenUsage: tokenUsage as unknown as Prisma.InputJsonValue } : {}),
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
      return { id: assistant.id, createdAt: assistant.createdAt };
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`persistTurn failed for conversation ${conversationId}: ${message}`);
    throw err;
  }
}

export async function persistAssistantMessage(
  conversationId: number,
  content: string,
  sources?: RagSource[],
  tokenUsage?: TokenUsage,
  parentId?: number
): Promise<Message> {
  return prisma.message.create({
    data: {
      conversationId,
      role: 'assistant',
      content,
      sources: sources && sources.length > 0 ? (sources as unknown as Prisma.InputJsonValue) : undefined,
      tokenUsage: tokenUsage ? (tokenUsage as unknown as Prisma.InputJsonValue) : undefined,
      parentId,
    },
  });
}
