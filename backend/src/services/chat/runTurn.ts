import logger from '../../logger';
import { defaultModelFor } from '../../config/models';
import { writeSseEvent } from '../../utils/sse';
import type { Response } from 'express';
import { maybeRefreshSummary } from '../conversationMemoryService';
import { assertSharedKeyQuota, recordUsage } from '../usage/quota';
import { runToolOrchestratedTurn } from '../tools/orchestrator';
import { prepareMessages } from './prepare';
import { runPlainTurn } from './plainTurn';
import type { SendInput } from './types';

export async function runTurn(
  input: SendInput,
  mode: {
    stream?: boolean;
    onToken?: (token: string) => void;
    onInit?: (conversationId: number, ragStatus?: string) => void;
    res?: { write: (chunk: string) => unknown };
  } = {}
) {
  const prepared = await prepareMessages(input);
  mode.onInit?.(prepared.convId, prepared.ragStatus);

  const provider = input.provider || 'openai';
  const model = input.model || defaultModelFor(provider);
  const responseStream = mode.res || input.res;
  const toolsEnabled = prepared.options.toolsEnabled === true;
  const sharedKey = prepared.options.sharedKey === true;

  await assertSharedKeyQuota({
    userId: input.userId,
    provider,
    sharedKey,
  });

  const result = toolsEnabled
    ? await runToolOrchestratedTurn({
        userId: input.userId,
        conversationId: prepared.convId,
        userMessage: input.message,
        chatMessages: prepared.chatMessages,
        provider,
        model,
        options: prepared.options,
        signal: input.signal,
        res: responseStream,
        onToken: mode.stream ? mode.onToken : undefined,
        skipUserMessage: prepared.isRegenerate,
        regenerateFromMessageId: prepared.regenerateFromMessageId,
        sources: prepared.sources,
        toolsEnabled: true,
      })
    : await runPlainTurn({
        conversationId: prepared.convId,
        userMessage: input.message,
        chatMessages: prepared.chatMessages,
        provider,
        model,
        options: prepared.options,
        signal: input.signal,
        onToken: mode.stream ? mode.onToken : undefined,
        skipUserMessage: prepared.isRegenerate,
        regenerateFromMessageId: prepared.regenerateFromMessageId,
        sources: prepared.sources,
        beforePersist: (tokenUsage) => {
          if (mode.stream && responseStream && tokenUsage) {
            writeSseEvent(responseStream as Response, 'token_usage', tokenUsage);
          }
        },
      });

  if (toolsEnabled && mode.stream && responseStream && result.tokenUsage) {
    writeSseEvent(responseStream as Response, 'token_usage', result.tokenUsage);
  }

  await recordUsage({
    userId: input.userId,
    provider,
    model,
    promptTokens: result.tokenUsage?.promptTokens ?? 0,
    completionTokens: result.tokenUsage?.completionTokens ?? 0,
    costUsd:
      typeof result.tokenUsage?.estimatedCostUsd === 'number'
        ? result.tokenUsage.estimatedCostUsd
        : 0,
    sharedKey,
  });

  void maybeRefreshSummary(input.userId, prepared.convId).catch((err) => {
    logger.warn(
      `maybeRefreshSummary skipped: ${err instanceof Error ? err.message : err}`
    );
  });

  if (!mode.stream) {
    logger.info(`Message sent in conversation ${prepared.convId} by user ${input.userId}`);
  }

  return {
    ...result,
    ragStatus: prepared.ragStatus,
  };
}
