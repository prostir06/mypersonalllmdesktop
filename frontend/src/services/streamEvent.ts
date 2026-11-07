import { z } from 'zod';
import type { StreamEvent } from '../types/api';
import { camelizeKeys } from '../utils/camelize';

const ragStatus = z.enum(['ok', 'empty', 'error', 'skipped']);

const tokenUsage = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  estimatedCostUsd: z.number().optional(),
});

const source = z
  .object({
    filename: z.string(),
    similarity: z.number().optional(),
  })
  .passthrough();

const streamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('init'),
    conversationId: z.union([z.string(), z.number()]),
    ragStatus: ragStatus.optional(),
  }),
  z.object({
    type: z.literal('token'),
    token: z.string(),
  }),
  z.object({
    type: z.literal('done'),
    messageId: z.union([z.string(), z.number()]).optional(),
    content: z.string().optional(),
    sources: z.array(source).optional(),
    tokenUsage: tokenUsage.optional(),
    ragStatus: ragStatus.optional(),
  }),
  tokenUsage.extend({ type: z.literal('token_usage') }),
  z
    .object({
      type: z.literal('tool_call'),
      id: z.string().optional(),
      name: z.string().optional(),
      tool: z.string().optional(),
      args: z.record(z.unknown()).optional(),
      uiSummary: z.string().optional(),
      status: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('tool_result'),
      id: z.string().optional(),
      name: z.string().optional(),
      tool: z.string().optional(),
      result: z.unknown().optional(),
      durationMs: z.number().optional(),
      uiSummary: z.string().optional(),
      status: z.string().optional(),
      error: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('tool_confirmation_required'),
      actionId: z.string(),
      toolName: z.string(),
      title: z.string(),
      summary: z.string(),
      diff: z.record(z.object({ from: z.unknown(), to: z.unknown() })).optional(),
      expiresAt: z.string().optional(),
    })
    .passthrough(),
  z.object({
    type: z.literal('error'),
    error: z.string().optional(),
  }),
]);

/** Camel-case the wire payload, then accept only a known SSE event. */
export function parseStreamEvent(
  raw: unknown,
  eventName = ''
): StreamEvent | null {
  const camel = camelizeKeys(raw);
  if (!camel || typeof camel !== 'object') return null;
  const record = camel as Record<string, unknown>;
  if (typeof record.type !== 'string' && eventName) record.type = eventName;
  const parsed = streamEventSchema.safeParse(record);
  return parsed.success ? (parsed.data as StreamEvent) : null;
}
