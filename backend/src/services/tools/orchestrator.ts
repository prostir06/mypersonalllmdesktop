import crypto from 'crypto';
import prisma from '../../config/prisma';
import logger from '../../logger';
import type { RagSource, TokenUsage } from '../chat/types';
import { persistTurn } from '../chat/persist';
import ProviderFactory from '../providerFactory';
import { modelSupportsTools } from '../../utils/modelCapabilities';
import { defaultModelFor } from '../../config/models';
import { sumTokenUsage } from '../providers/shared';
import { writeSseEvent } from '../../utils/sse';
import { runPlainTurn } from '../chat/plainTurn';
import { readToolsOverride, resolveToolsEnabled } from '../chat/toolMode';
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
import { executeReadTool, summarizeToolPayload } from './toolExecutor';
import { synthesizeEmptyToolReply } from './emptyToolReply';

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
  const model = options.model || defaultModelFor(provider);

  let settingsEnabled = true;
  const explicit = readToolsOverride(
    options.toolsEnabled,
    options.options?.toolsEnabled,
    options.options?.tools_enabled
  );
  if (explicit === undefined) {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: options.userId },
      select: { toolsEnabled: true },
    });
    settingsEnabled = settings?.toolsEnabled ?? true;
  }
  const toolsOn = resolveToolsEnabled({
    settingsEnabled,
    clientOverride: explicit,
    model,
    provider,
  });

  if (!toolsOn) {
    logger.info(
      `Non-tool flow for user ${options.userId} (toolsEnabled=${explicit ?? settingsEnabled}, modelSupportsTools=${modelSupportsTools(model, provider)})`
    );
    return runPlainTurn({
      conversationId: options.conversationId,
      userMessage: options.userMessage || '',
      chatMessages: options.chatMessages,
      provider,
      model,
      options: options.options,
      signal: options.signal,
      onToken: options.onToken,
      skipUserMessage: options.skipUserMessage,
      regenerateFromMessageId: options.regenerateFromMessageId,
      sources: options.sources,
    });
  }

  // Multi-turn tool loop
  const dialogueHistory: Array<{ role: string; content?: unknown; [key: string]: unknown }> = [
    ...options.chatMessages,
  ];
  const toolTrace: ToolTraceEntry[] = [];
  const accumulatedSources: RagSource[] = [...(options.sources || [])];
  const usageParts: Array<TokenUsage | undefined> = [];
  let streamedVisible = '';
  let lastResponse: any = null;

  const recordVisible = (token: string) => {
    if (!token) return;
    streamedVisible += token;
    options.onToken?.(token);
  };

  for (let iteration = 1; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    const toolDefinitions = toolRegistry.getDefinitions();
    const providerOpts = {
      ...(options.options || {}),
      tools: toolDefinitions,
      signal: options.signal,
    };

    const isStreaming = Boolean(options.onToken);
    let iterationEmitted = false;
    let response: any;
    if (isStreaming) {
      response = await ProviderFactory.streamMessage(
        provider,
        dialogueHistory,
        model,
        providerOpts,
        (token: string) => {
          iterationEmitted = true;
          recordVisible(token);
        }
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
    usageParts.push(response.tokenUsage);
    if (isStreaming && !iterationEmitted && typeof response.content === 'string' && response.content) {
      recordVisible(response.content);
    }

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
      call.name = tool.name;

      if (tool.category === 'write') {
        if (!writeToolFound) {
          writeToolFound = { call, tool, args };
        }
      } else {
        readToolCalls.push({ call, tool, args });
      }
    }

    const ctx: ToolExecutionContext = {
      userId: options.userId,
      conversationId: options.conversationId,
      provider,
      model,
      signal: options.signal,
    };
    const executions = await Promise.all(
      readToolCalls.map(({ call, tool, args }) =>
        executeReadTool(call, tool, args, ctx, {
          res: options.res,
          accumulatedSources,
          toolTrace,
        })
      )
    );
    if (executions.length > 0) {
      dialogueHistory.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: executions.map(({ call }) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.argumentsJson },
        })),
      });
      for (const exec of executions) {
        dialogueHistory.push({
          role: 'tool',
          tool_call_id: exec.call.id,
          content: exec.resultStr,
        });
      }
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

      const pauseContent = options.onToken ? streamedVisible : (response.content || '');
      const pauseUsage = sumTokenUsage(usageParts);
      const pauseTrace = storedToolTrace(toolTrace);
      const assistant = await persistTurn(
        options.conversationId,
        options.userMessage || '',
        pauseContent,
        {
          skipUserMessage: options.skipUserMessage,
          regenerateFromMessageId: options.regenerateFromMessageId,
          sources: accumulatedSources,
          tokenUsage: pauseUsage,
          toolTrace: pauseTrace,
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
        content: pauseContent,
        role: 'assistant' as const,
        timestamp: assistant.createdAt,
        sources: accumulatedSources,
        toolTrace: pauseTrace,
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
        tokenUsage: pauseUsage,
      };
    }

    // Break early if model emitted tool calls but none could be executed
    if (readToolCalls.length === 0 && !writeToolFound) {
      logger.warn(`Iteration ${iteration}: tool calls emitted but none could be executed. Breaking tool loop.`);
      break;
    }

    // Stop if max iterations reached
    if (iteration === MAX_TOOL_ITERATIONS) {
      break;
    }
  }

  let finalText = lastResponse?.content || '';
  if (!finalText.trim() && toolTrace.length > 0) {
    const synthesized = synthesizeEmptyToolReply(toolTrace);
    if (synthesized) {
      finalText = synthesized;
      if (options.onToken) recordVisible(finalText);
    }
  }

  const persistedContent = options.onToken ? streamedVisible : finalText;
  const persistedUsage = sumTokenUsage(usageParts);
  const persistedTrace = toolTrace.length > 0 ? storedToolTrace(toolTrace) : undefined;
  const assistant = await persistTurn(
    options.conversationId,
    options.userMessage || '',
    persistedContent,
    {
      skipUserMessage: options.skipUserMessage,
      regenerateFromMessageId: options.regenerateFromMessageId,
      sources: accumulatedSources,
      tokenUsage: persistedUsage,
      toolTrace: persistedTrace,
    }
  );

  return {
    conversationId: options.conversationId,
    messageId: assistant.id,
    content: persistedContent,
    role: 'assistant' as const,
    timestamp: assistant.createdAt,
    sources: accumulatedSources,
    toolTrace: persistedTrace,
    tokenUsage: persistedUsage,
  };
}

function storedToolTrace(trace: ToolTraceEntry[]): ToolTraceEntry[] {
  return trace.map((entry) => ({
    ...entry,
    args: summarizeToolPayload(entry.args) as Record<string, unknown>,
    result: summarizeToolPayload(entry.result),
  }));
}

export { resolvePendingToolAction } from './actionResolver';
