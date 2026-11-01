import prisma from '../../config/prisma';
import { ChatError } from '../chat/types';
import toolRegistry from './registry';
import type { ToolExecutionContext } from './types';

export async function resolvePendingToolAction(
  actionId: string,
  userId: number,
  decision: 'approve' | 'reject'
) {
  const action = await prisma.pendingToolAction.findUnique({
    where: { id: actionId },
  });

  if (!action) {
    throw new ChatError(404, 'Pending action not found');
  }

  if (action.userId !== userId) {
    throw new ChatError(403, 'Forbidden: you do not own this pending action');
  }

  if (action.status !== 'pending') {
    throw new ChatError(409, `Action is already ${action.status}`);
  }

  if (new Date(action.expiresAt) < new Date()) {
    await prisma.pendingToolAction.update({
      where: { id: actionId },
      data: { status: 'expired' },
    });
    throw new ChatError(410, 'Pending action has expired');
  }

  if (decision === 'reject') {
    await prisma.pendingToolAction.update({
      where: { id: actionId },
      data: {
        status: 'rejected',
        resolvedAt: new Date(),
      },
    });

    const message = await prisma.message.findUnique({
      where: { id: action.messageId },
      select: { id: true, toolTrace: true },
    });
    if (message && Array.isArray(message.toolTrace)) {
      const updatedTrace = (message.toolTrace as any[]).map((entry) => {
        if (entry.pendingActionId === actionId) {
          return { ...entry, status: 'rejected' };
        }
        return entry;
      });
      await prisma.message.update({
        where: { id: message.id },
        data: { toolTrace: updatedTrace },
      });
    }

    return { success: true, status: 'rejected' };
  }

  // decision === 'approve'
  const tool = toolRegistry.get(action.toolName);
  if (!tool) {
    throw new ChatError(404, `Tool "${action.toolName}" not found in registry`);
  }

  const ctx: ToolExecutionContext = {
    userId: action.userId,
    conversationId: action.conversationId,
  };
  const args = typeof action.toolArgs === 'string'
    ? JSON.parse(action.toolArgs)
    : action.toolArgs;

  const result = await tool.execute(args, ctx);
  const resultSummary = typeof result === 'string' ? result : JSON.stringify(result);

  // Atomic update to prevent race conditions or double-execution
  if (typeof (prisma.pendingToolAction as any).updateMany === 'function') {
    const updated = await (prisma.pendingToolAction as any).updateMany({
      where: { id: actionId, status: 'pending' },
      data: {
        status: 'approved',
        resolvedAt: new Date(),
        resultSummary,
      },
    });
    if (updated.count === 0) {
      const current = await prisma.pendingToolAction.findUnique({ where: { id: actionId } });
      if (!current) throw new ChatError(404, 'Pending action not found');
      throw new ChatError(409, `Action is already ${current.status}`);
    }
  }
  if (typeof (prisma.pendingToolAction as any).update === 'function') {
    await prisma.pendingToolAction.update({
      where: { id: actionId },
      data: {
        status: 'approved',
        resolvedAt: new Date(),
        resultSummary,
      },
    });
  }

  const message = await prisma.message.findUnique({
    where: { id: action.messageId },
    select: { id: true, toolTrace: true },
  });
  if (message && Array.isArray(message.toolTrace)) {
    const updatedTrace = (message.toolTrace as any[]).map((entry) => {
      if (entry.pendingActionId === actionId) {
        return { ...entry, status: 'completed', result };
      }
      return entry;
    });
    await prisma.message.update({
      where: { id: message.id },
      data: { toolTrace: updatedTrace },
    });
  }

  const updatedMessage = await prisma.message.findUnique({
    where: { id: action.messageId },
  });

  return { success: true, status: 'approved', result, resultSummary, updatedMessage };
}
