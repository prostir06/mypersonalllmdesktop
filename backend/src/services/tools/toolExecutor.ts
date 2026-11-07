import type { Response } from 'express';
import logger from '../../logger';
import { writeSseEvent } from '../../utils/sse';
import type { RegisteredTool, ToolExecutionContext, ToolTraceEntry } from './types';
import type { NormalizedToolCall } from '../providers/types';
import type { RagSource } from '../chat/types';

export const TOOL_TIMEOUT_MS = 15000;
export const MAX_TOOL_OUTPUT_CHARS = 4000;
export const TOOL_TRACE_SUMMARY_CHARS = 500;

const SECRET_KEY = /(api[_-]?key|secret|password|authorization|^token$|access[_-]?token)/i;

export function summarizeToolPayload(value: unknown, max = TOOL_TRACE_SUMMARY_CHARS): unknown {
  if (typeof value === 'string') {
    return value.length > max ? `${value.slice(0, max)}... [truncated]` : value;
  }
  if (Array.isArray(value)) {
    const head = value.slice(0, 20).map((item) => summarizeToolPayload(item, max));
    return value.length > 20 ? [...head, `... [${value.length - 20} more]`] : head;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : summarizeToolPayload(nested, max);
    }
    const json = JSON.stringify(out);
    if (json.length > max) return `${json.slice(0, max)}... [truncated]`;
    return out;
  }
  return value;
}

export async function executeReadTool(
  call: NormalizedToolCall,
  tool: RegisteredTool,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
  options: {
    res?: Response | { write: (chunk: string) => unknown };
    accumulatedSources: RagSource[];
    toolTrace: ToolTraceEntry[];
  }
): Promise<{ call: NormalizedToolCall; resultStr: string }> {
  if (options.res) {
    writeSseEvent(options.res as unknown as Response, 'tool_call', {
      id: call.id,
      name: call.name,
      args,
    });
  }

  const startMs = Date.now();
  let result: unknown;
  let hasError = false;
  let errorMessage: string | undefined;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
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
    logger.warn(`Tool execution failed for "${call.name}": ${errorMessage}`);
    result = { error: errorMessage };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  const durationMs = Date.now() - startMs;

  if (
    result &&
    typeof result === 'object' &&
    'sources' in result &&
    Array.isArray((result as { sources: unknown }).sources)
  ) {
    options.accumulatedSources.push(
      ...((result as { sources: RagSource[] }).sources)
    );
  }

  let resultStr = typeof result === 'string' ? result : JSON.stringify(result);
  if (resultStr.length > MAX_TOOL_OUTPUT_CHARS) {
    resultStr = resultStr.slice(0, MAX_TOOL_OUTPUT_CHARS) + '... [truncated]';
  }

  if (options.res) {
    writeSseEvent(options.res as unknown as Response, 'tool_result', {
      id: call.id,
      name: call.name,
      result: summarizeToolPayload(result),
      durationMs,
    });
  }

  options.toolTrace.push({
    tool: call.name,
    args,
    category: 'read',
    result,
    durationMs,
    status: hasError ? 'failed' : 'completed',
    ...(errorMessage ? { error: errorMessage } : {}),
  });

  return { call, resultStr };
}
