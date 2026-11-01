import crypto from 'crypto';
import prisma from '../../config/prisma';
import logger from '../../logger';
import { ChatError } from '../chat/types';
import type { RagSource, TokenUsage } from '../chat/types';
import { persistTurn } from '../chat/persist';
import ProviderFactory from '../providerFactory';
import { modelSupportsTools } from '../../utils/modelCapabilities';
import { writeSseEvent } from '../../utils/sse';
import toolRegistry from './registry';
import type {
  ToolExecutionContext,
  RegisteredTool,
  ToolTraceEntry,
} from './types';
import type { NormalizedToolCall } from '../providers/types';

export const MAX_TOOL_ITERATIONS = 5;
export const TOOL_TIMEOUT_MS = 15000;
export const MAX_TOOL_OUTPUT_CHARS = 4000;
export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface ToolOrchestrationOptions {
  userId: number;
  conversationId: number;
  userMessage?: string;
  chatMessages: Array<{ role: string; content?: unknown; [key: string]: unknown }>;
  provider?: string;
  model?: string;
  options?: Record<string, unknown>;
  signal?: AbortSignal;
  res?: any;
  onToken?: (token: string) => void;
  skipUserMessage?: boolean;
  regenerateFromMessageId?: number;
  sources?: RagSource[];
  toolsEnabled?: boolean;
}

export async function runToolOrchestratedTurn(
  options: ToolOrchestrationOptions
) {
  const provider = options.provider || 'openai';
  const model = options.model || 'gpt-3.5-turbo';

  let toolsEnabled = options.toolsEnabled;
  if (toolsEnabled === undefined && options.options?.toolsEnabled !== undefined) {
    toolsEnabled = Boolean(options.options.toolsEnabled);
  }
  if (toolsEnabled === undefined && options.options?.tools_enabled !== undefined) {
    toolsEnabled = Boolean(options.options.tools_enabled);
  }
  if (toolsEnabled === undefined) {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: options.userId },
      select: { toolsEnabled: true },
    });
    toolsEnabled = settings?.toolsEnabled ?? true;
  }

  const supportsTools = modelSupportsTools(model, provider);

  // Fallback to normal non-tool chat flow if tools disabled or unsupported
  if (!toolsEnabled || !supportsTools) {
    logger.info(
      `Non-tool flow for user ${options.userId} (toolsEnabled=${toolsEnabled}, modelSupportsTools=${supportsTools})`
    );

    let response: {
      content: string;
      usage?: unknown;
      tokenUsage?: TokenUsage;
      model?: string;
      sources?: unknown[];
    };

    if (options.onToken) {
      response = await ProviderFactory.streamMessage(
        provider,
        options.chatMessages,
        model,
        { ...(options.options || {}), signal: options.signal },
        options.onToken
      );
    } else {
      response = await ProviderFactory.sendMessage(
        provider,
        options.chatMessages,
        model,
        { ...(options.options || {}), signal: options.signal }
      );
    }

    const mergedSources: RagSource[] = [
      ...(options.sources || []),
      ...((response.sources as RagSource[]) || []),
    ];
    const tokenUsage = response.tokenUsage;

    const assistant = await persistTurn(
      options.conversationId,
      options.userMessage || '',
      response.content,
      {
        skipUserMessage: options.skipUserMessage,
        regenerateFromMessageId: options.regenerateFromMessageId,
        sources: mergedSources,
        tokenUsage,
      }
    );

    return {
      conversationId: options.conversationId,
      messageId: assistant.id,
      content: response.content,
      role: 'assistant' as const,
      timestamp: assistant.createdAt,
      usage: response.usage,
      tokenUsage,
      sources: mergedSources,
    };
  }

  // Multi-turn tool loop
  const dialogueHistory: Array<{ role: string; content?: unknown; [key: string]: unknown }> = [
    ...options.chatMessages,
  ];
  const toolTrace: ToolTraceEntry[] = [];
  const accumulatedSources: RagSource[] = [...(options.sources || [])];
  let lastResponse: any = null;

  for (let iteration = 1; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    const toolDefinitions = toolRegistry.getDefinitions();
    const providerOpts = {
      ...(options.options || {}),
      tools: toolDefinitions,
      signal: options.signal,
    };

    const response = await ProviderFactory.sendMessage(
      provider,
      dialogueHistory,
      model,
      providerOpts
    );
    lastResponse = response;

    if (response.sources && Array.isArray(response.sources)) {
      accumulatedSources.push(...(response.sources as RagSource[]));
    }

    const toolCalls = response.toolCalls;
    if (!toolCalls || toolCalls.length === 0) {
      // Model produced text without calling tools
      break;
    }

    // Process tool calls
    let writeToolFound: { call: NormalizedToolCall; tool: RegisteredTool; args: any } | null = null;
    const readToolCalls: Array<{ call: NormalizedToolCall; tool: RegisteredTool; args: any }> = [];

    for (const call of toolCalls) {
      let args: any;
      try {
        args = typeof call.argumentsJson === 'string'
          ? JSON.parse(call.argumentsJson)
          : (call.argumentsJson || {});
      } catch {
        args = {};
      }

      const tool = toolRegistry.get(call.name);
      if (!tool) {
        toolTrace.push({
          tool: call.name,
          args,
          category: 'read',
          durationMs: 0,
          status: 'failed',
          error: `Tool "${call.name}" not found in registry`,
        });
        continue;
      }

      if (tool.category === 'write') {
        if (!writeToolFound) {
          writeToolFound = { call, tool, args };
        }
      } else {
        readToolCalls.push({ call, tool, args });
      }
    }

    // Execute read tools
    for (const { call, tool, args } of readToolCalls) {
      if (options.res) {
        writeSseEvent(options.res, 'tool_call', {
          id: call.id,
          name: call.name,
          args,
        });
      }

      const ctx: ToolExecutionContext = {
        userId: options.userId,
        conversationId: options.conversationId,
        provider,
        model,
        signal: options.signal,
      };

      const startMs = Date.now();
      let result: any;
      let hasError = false;
      let errorMessage: string | undefined;

      let timeoutId: any;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(`Tool execution timed out after ${TOOL_TIMEOUT_MS}ms`)),
            TOOL_TIMEOUT_MS
          );
        });
        const execPromise = Promise.resolve().then(() => tool.execute(args, ctx));
        result = await Promise.race([execPromise, timeoutPromise]);
      } catch (err: unknown) {
        hasError = true;
        errorMessage = err instanceof Error ? err.message : String(err);
        result = { error: errorMessage };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      const durationMs = Date.now() - startMs;

      if (result?.sources && Array.isArray(result.sources)) {
        accumulatedSources.push(...result.sources);
      }

      let resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      if (resultStr.length > MAX_TOOL_OUTPUT_CHARS) {
        resultStr = resultStr.slice(0, MAX_TOOL_OUTPUT_CHARS) + '... [truncated]';
      }

      if (options.res) {
        writeSseEvent(options.res, 'tool_result', {
          id: call.id,
          name: call.name,
          result,
          durationMs,
        });
      }

      dialogueHistory.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: [
          {
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.argumentsJson },
          },
        ],
      });
      dialogueHistory.push({
        role: 'tool',
        tool_call_id: call.id,
        content: resultStr,
      });

      toolTrace.push({
        tool: call.name,
        args,
        category: 'read',
        result,
        durationMs,
        status: hasError ? 'failed' : 'completed',
        ...(errorMessage ? { error: errorMessage } : {}),
      });
    }

    // Handle write tool pause if called
    if (writeToolFound) {
      const { call, tool, args } = writeToolFound;
      let proposal: string;
      try {
        proposal = (await tool.describeProposal?.(args, {
          userId: options.userId,
          conversationId: options.conversationId,
          provider,
          model,
        })) || '';
      } catch {
        proposal = `Запит на виконання дії ${call.name}`;
      }

      const actionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + PENDING_ACTION_TTL_MS);

      toolTrace.push({
        tool: call.name,
        args,
        category: 'write',
        requiresConfirmation: true,
        pendingActionId: actionId,
        status: 'pending_confirmation',
        durationMs: 0,
      });

      const assistant = await persistTurn(
        options.conversationId,
        options.userMessage || '',
        response.content || '',
        {
          skipUserMessage: options.skipUserMessage,
          regenerateFromMessageId: options.regenerateFromMessageId,
          sources: accumulatedSources,
          tokenUsage: response.tokenUsage,
          toolTrace,
        }
      );

      await prisma.pendingToolAction.create({
        data: {
          id: actionId,
          userId: options.userId,
          conversationId: options.conversationId,
          messageId: assistant.id,
          toolName: call.name,
          toolArgs: args,
          status: 'pending',
          expiresAt,
        },
      });

      if (options.res) {
        writeSseEvent(options.res, 'tool_confirmation_required', {
          actionId,
          toolName: call.name,
          toolArgs: args,
          proposal,
          expiresAt,
        });
      }

      return {
        conversationId: options.conversationId,
        messageId: assistant.id,
        content: response.content || '',
        role: 'assistant' as const,
        timestamp: assistant.createdAt,
        sources: accumulatedSources,
        toolTrace,
        pendingAction: {
          actionId,
          toolName: call.name,
          toolArgs: args,
          proposal,
          expiresAt,
        },
        status: 'pending_confirmation',
        tokenUsage: response.tokenUsage,
      };
    }

    // Stop if max iterations reached
    if (iteration === MAX_TOOL_ITERATIONS) {
      break;
    }
  }

  const finalText = lastResponse?.content || '';
  if (options.onToken && finalText) {
    options.onToken(finalText);
  }

  const assistant = await persistTurn(
    options.conversationId,
    options.userMessage || '',
    finalText,
    {
      skipUserMessage: options.skipUserMessage,
      regenerateFromMessageId: options.regenerateFromMessageId,
      sources: accumulatedSources,
      tokenUsage: lastResponse?.tokenUsage,
      toolTrace: toolTrace.length > 0 ? toolTrace : undefined,
    }
  );

  return {
    conversationId: options.conversationId,
    messageId: assistant.id,
    content: finalText,
    role: 'assistant' as const,
    timestamp: assistant.createdAt,
    sources: accumulatedSources,
    toolTrace,
    tokenUsage: lastResponse?.tokenUsage,
  };
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

  return { success: true, status: 'approved', result };
}
