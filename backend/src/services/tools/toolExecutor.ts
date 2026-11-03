import logger from '../../logger';
import { writeSseEvent } from '../../utils/sse';
import type { RegisteredTool, ToolExecutionContext, ToolTraceEntry } from './types';
import type { NormalizedToolCall } from '../providers/types';
import type { RagSource } from '../chat/types';

export const TOOL_TIMEOUT_MS = 15000;
export const MAX_TOOL_OUTPUT_CHARS = 4000;

export async function executeReadTool(
  call: NormalizedToolCall,
  tool: RegisteredTool,
  args: any,
  ctx: ToolExecutionContext,
  options: {
    res?: any;
    responseContent?: string;
    dialogueHistory: Array<{ role: string; content?: unknown; [key: string]: unknown }>;
    accumulatedSources: RagSource[];
    toolTrace: ToolTraceEntry[];
  }
) {
  if (options.res) {
    writeSseEvent(options.res, 'tool_call', {
      id: call.id,
      name: call.name,
      args,
    });
  }

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
    logger.warn(`Tool execution failed for "${call.name}": ${errorMessage}`);
    result = { error: errorMessage };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  const durationMs = Date.now() - startMs;

  if (result?.sources && Array.isArray(result.sources)) {
    options.accumulatedSources.push(...result.sources);
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

  options.dialogueHistory.push({
    role: 'assistant',
    content: options.responseContent || '',
    tool_calls: [
      {
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.argumentsJson },
      },
    ],
  });
  options.dialogueHistory.push({
    role: 'tool',
    tool_call_id: call.id,
    content: resultStr,
  });

  options.toolTrace.push({
    tool: call.name,
    args,
    category: 'read',
    result,
    durationMs,
    status: hasError ? 'failed' : 'completed',
    ...(errorMessage ? { error: errorMessage } : {}),
  });
}
