import crypto from 'crypto';
import prisma from '../../config/prisma';
import logger from '../../logger';
import type { RagSource, TokenUsage } from '../chat/types';
import { persistTurn } from '../chat/persist';
import ProviderFactory from '../providerFactory';
import { modelSupportsTools } from '../../utils/modelCapabilities';
import { writeSseEvent } from '../../utils/sse';
import toolRegistry from './registry';
import type {
  ToolExecutionContext,
  RegisteredTool,
  ToolProposal,
  ToolTraceEntry,
} from './types';
import type { NormalizedToolCall } from '../providers/types';

export const MAX_TOOL_ITERATIONS = 5;
export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000; // 15 minutes
export { TOOL_TIMEOUT_MS, MAX_TOOL_OUTPUT_CHARS } from './toolExecutor';
import { executeReadTool } from './toolExecutor';

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

    const isStreaming = Boolean(options.onToken);
    let response: any;
    if (isStreaming) {
      response = await ProviderFactory.streamMessage(
        provider,
        dialogueHistory,
        model,
        providerOpts,
        options.onToken
      );
    } else {
      response = await ProviderFactory.sendMessage(
        provider,
        dialogueHistory,
        model,
        providerOpts
      );
    }
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
      } catch (err: unknown) {
        logger.warn(
          `Failed to parse tool call arguments for "${call.name}": ${err instanceof Error ? err.message : String(err)}`
        );
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
      const ctx: ToolExecutionContext = {
        userId: options.userId,
        conversationId: options.conversationId,
        provider,
        model,
        signal: options.signal,
      };
      await executeReadTool(call, tool, args, ctx, {
        res: options.res,
        responseContent: response.content || '',
        dialogueHistory,
        accumulatedSources,
        toolTrace,
      });
    }

    // Handle write tool pause if called
    if (writeToolFound) {
      const { call, tool, args } = writeToolFound;
      let proposal: ToolProposal;
      try {
        const rawProposal = await tool.describeProposal?.(args, {
          userId: options.userId,
          conversationId: options.conversationId,
          provider,
          model,
        });
        if (typeof rawProposal === 'string') {
          proposal = {
            title: `Запит на виконання дії ${call.name}`,
            summary: rawProposal,
          };
        } else if (rawProposal && typeof rawProposal === 'object') {
          proposal = rawProposal;
        } else {
          proposal = {
            title: `Запит на виконання дії ${call.name}`,
            summary: `Виконати ${call.name}`,
          };
        }
      } catch (proposalErr: unknown) {
        logger.warn(
          `Failed to describe proposal for write tool "${call.name}": ${proposalErr instanceof Error ? proposalErr.message : String(proposalErr)}`
        );
        proposal = {
          title: `Запит на виконання дії ${call.name}`,
          summary: `Запит на виконання дії ${call.name}`,
        };
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

      const pendingAction = await prisma.pendingToolAction.create({
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

      const effectiveActionId = pendingAction?.id || actionId;
      const effectiveExpiresAt = pendingAction?.expiresAt ? new Date(pendingAction.expiresAt) : expiresAt;

      if (options.res) {
        writeSseEvent(options.res, 'tool_confirmation_required', {
          actionId: effectiveActionId,
          toolName: call.name,
          title: proposal.title,
          summary: proposal.summary,
          diff: proposal.diff,
          expiresAt: effectiveExpiresAt.toISOString(),
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
          actionId: effectiveActionId,
          toolName: call.name,
          toolArgs: args,
          title: proposal.title,
          summary: proposal.summary,
          proposal: proposal.summary,
          diff: proposal.diff,
          expiresAt: effectiveExpiresAt,
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
  if (!options.onToken && finalText) {
    // If not streaming, do nothing
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

export { resolvePendingToolAction } from './actionResolver';
