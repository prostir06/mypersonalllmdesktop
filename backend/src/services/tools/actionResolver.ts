import prisma from '../../config/prisma';
import logger from '../../logger';
import { ChatError } from '../chat/types';
import toolRegistry from './registry';
import { ToolValidationError, type ToolExecutionContext } from './types';

async function claimPending(actionId: string): Promise<void> {
  const updated = await prisma.pendingToolAction.updateMany({
    where: { id: actionId, status: 'pending' },
    data: { status: 'executing' },
  });
  if (updated.count === 0) {
    const current = await prisma.pendingToolAction.findUnique({
      where: { id: actionId },
    });
    if (!current) throw new ChatError(404, 'Pending action not found');
    throw new ChatError(409, `Action is already ${current.status}`);
  }
}

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

  await claimPending(actionId);

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
    await prisma.pendingToolAction.update({
      where: { id: actionId },
      data: { status: 'failed', resolvedAt: new Date() },
    });
    throw new ChatError(404, `Tool "${action.toolName}" not found in registry`);
  }

  const ctx: ToolExecutionContext = {
    userId: action.userId,
    conversationId: action.conversationId,
  };
  let args: any;
  try {
    args = typeof action.toolArgs === 'string'
      ? JSON.parse(action.toolArgs)
      : action.toolArgs;
  } catch (parseErr: unknown) {
    logger.error(
      `Malformed pending tool action arguments for action ${actionId}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
    );
    await prisma.pendingToolAction.update({
      where: { id: actionId },
      data: { status: 'failed', resolvedAt: new Date() },
    });
    throw new ChatError(400, 'Invalid tool arguments format', { cause: parseErr });
  }

  let result: any;
  try {
    result = await tool.execute(args, ctx);
  } catch (execErr: unknown) {
    logger.error(
      `Failed to execute approved tool "${action.toolName}": ${execErr instanceof Error ? execErr.message : String(execErr)}`
    );
    await prisma.pendingToolAction.update({
      where: { id: actionId },
      data: { status: 'failed', resolvedAt: new Date() },
    });
    if (execErr instanceof ChatError || execErr instanceof ToolValidationError) {
      throw execErr;
    }
    throw new ChatError(
      500,
      `Tool execution failed: ${execErr instanceof Error ? execErr.message : String(execErr)}`,
      { cause: execErr }
    );
  }
  const resultSummary = typeof result === 'string' ? result : JSON.stringify(result);

  await prisma.pendingToolAction.update({
    where: { id: actionId },
    data: {
      status: 'approved',
      resolvedAt: new Date(),
      resultSummary,
    },
  });

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
