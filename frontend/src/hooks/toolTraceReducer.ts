import type { Message, ToolTraceEntry } from '../types/api';

export type SseToolCallPayload = {
  id?: string;
  name?: string;
  tool?: string;
  args?: Record<string, unknown>;
  uiSummary?: string;
  status?: string;
  [key: string]: unknown;
};

export type SseToolResultPayload = {
  id?: string;
  name?: string;
  tool?: string;
  result?: unknown;
  durationMs?: number;
  uiSummary?: string;
  status?: string;
  error?: string;
  [key: string]: unknown;
};

export type SseToolConfirmationPayload = {
  actionId?: string;
  pendingActionId?: string;
  toolName?: string;
  tool?: string;
  args?: Record<string, unknown>;
  toolArgs?: Record<string, unknown>;
  proposal?: {
    title?: string;
    summary?: string;
  };
  title?: string;
  summary?: string;
  diff?: Record<string, { from: unknown; to: unknown }>;
  expiresAt?: string;
  [key: string]: unknown;
};

export function applyToolCallEvent(
  trace: ToolTraceEntry[],
  payload: SseToolCallPayload
): ToolTraceEntry[] {
  const toolName = payload.name || payload.tool || 'tool';
  const args = payload.args || {};
  const status: ToolTraceEntry['status'] =
    (payload.status as ToolTraceEntry['status']) || 'running';
  const callId = payload.id;

  const existingIdx = callId
    ? trace.findIndex((e) => e.callId === callId || e.id === callId)
    : -1;

  const newEntry: ToolTraceEntry = {
    tool: toolName,
    args,
    category: 'read',
    status,
    callId,
    ...(payload.uiSummary ? { summary: payload.uiSummary } : {}),
  };

  if (existingIdx >= 0) {
    const next = [...trace];
    next[existingIdx] = {
      ...next[existingIdx],
      ...newEntry,
    };
    return next;
  }
  return [...trace, newEntry];
}

export function applyToolResultEvent(
  trace: ToolTraceEntry[],
  payload: SseToolResultPayload
): ToolTraceEntry[] {
  const toolName = payload.name || payload.tool;
  const callId = payload.id;
  const existingIdx = callId
    ? trace.findIndex((e) => e.callId === callId || e.id === callId)
    : trace.findIndex((e) => e.tool === toolName);

  const hasError = Boolean(
    payload.error || payload.status === 'failed' || payload.status === 'error'
  );
  const status: 'completed' | 'failed' = hasError ? 'failed' : 'completed';

  if (existingIdx >= 0) {
    const next = [...trace];
    next[existingIdx] = {
      ...next[existingIdx],
      result: payload.result,
      durationMs: payload.durationMs,
      status,
      ...(payload.error ? { error: payload.error } : {}),
      ...(payload.uiSummary ? { summary: payload.uiSummary } : {}),
    };
    return next;
  }

  const newEntry: ToolTraceEntry = {
    tool: toolName || 'tool',
    args: {},
    category: 'read',
    result: payload.result,
    durationMs: payload.durationMs,
    status,
    callId,
    ...(payload.error ? { error: payload.error } : {}),
    ...(payload.uiSummary ? { summary: payload.uiSummary } : {}),
  };
  return [...trace, newEntry];
}

export function applyToolConfirmationEvent(
  trace: ToolTraceEntry[],
  payload: SseToolConfirmationPayload
): ToolTraceEntry[] {
  const actionId = payload.pendingActionId || payload.actionId;
  const tool = payload.tool || payload.toolName || 'tool';
  const args = payload.args || payload.toolArgs || {};
  const title = payload.proposal?.title ?? payload.title;
  const summary = payload.proposal?.summary ?? payload.summary;

  const newEntry: ToolTraceEntry = {
    tool,
    args,
    category: 'write',
    requiresConfirmation: true,
    pendingActionId: actionId,
    status: 'pending_confirmation',
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {}),
    ...(payload.diff ? { diff: payload.diff } : {}),
    ...(payload.expiresAt ? { expiresAt: payload.expiresAt } : {}),
  };

  const existingIdx = trace.findIndex(
    (e) =>
      (actionId && e.pendingActionId === actionId) ||
      (e.category === 'write' && e.tool === tool && e.status === 'pending_confirmation')
  );

  if (existingIdx >= 0) {
    const next = [...trace];
    next[existingIdx] = {
      ...next[existingIdx],
      ...newEntry,
    };
    return next;
  }
  return [...trace, newEntry];
}

export function upsertStreamingAssistantMessage(
  messages: Message[],
  inFlightIndex: number | null | undefined,
  content: string,
  toolTrace: Array<ToolTraceEntry | (Partial<ToolTraceEntry> & { tool: string })>
): { messages: Message[]; inFlightIndex: number } {
  const normalizedTrace =
    toolTrace.length > 0
      ? toolTrace.map((entry) => ({
          args: {},
          category: 'read' as const,
          status: 'completed' as const,
          ...entry,
        }))
      : undefined;

  if (typeof inFlightIndex === 'number' && inFlightIndex >= 0 && inFlightIndex < messages.length) {
    const existing = messages[inFlightIndex] || { role: 'assistant', content: '' };
    const nextMessages = [...messages];
    nextMessages[inFlightIndex] = {
      ...existing,
      role: 'assistant',
      content: content || existing.content || '',
      tool_trace: normalizedTrace ?? existing.tool_trace,
      toolTrace: normalizedTrace ?? existing.toolTrace,
    };
    return { messages: nextMessages, inFlightIndex };
  }

  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];
  if (last && last.role === 'assistant') {
    const nextMessages = [...messages];
    nextMessages[lastIdx] = {
      ...last,
      content: content || last.content,
      tool_trace: normalizedTrace ?? last.tool_trace,
      toolTrace: normalizedTrace ?? last.toolTrace,
    };
    return { messages: nextMessages, inFlightIndex: lastIdx };
  }

  const newMsg: Message = {
    role: 'assistant',
    content,
    tool_trace: normalizedTrace,
    toolTrace: normalizedTrace,
    created_at: new Date().toISOString(),
  };
  return {
    messages: [...messages, newMsg],
    inFlightIndex: messages.length,
  };
}

export function createToolTraceHandlers(
  onUpdate: (updater: (prev: ToolTraceEntry[]) => ToolTraceEntry[]) => void
) {
  return {
    onToolCall: (payload: SseToolCallPayload) => {
      onUpdate((trace) => applyToolCallEvent(trace, payload));
    },
    onToolResult: (payload: SseToolResultPayload) => {
      onUpdate((trace) => applyToolResultEvent(trace, payload));
    },
    onToolConfirmationRequired: (payload: SseToolConfirmationPayload) => {
      onUpdate((trace) => applyToolConfirmationEvent(trace, payload));
    },
  };
}
