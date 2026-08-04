/**
 * Pure SSE line helpers for chat streaming (unit-tested).
 */
import type { StreamEvent } from '../types/api';

export type SseHandlers = {
  onToken?: (token: string) => void;
  onInit?: (conversationId: string | number) => void;
};

/**
 * Append a chunk to the SSE buffer and dispatch complete `data:` events.
 * Returns the leftover incomplete buffer.
 */
export function consumeSseChunk(
  buffer: string,
  chunk: string,
  handlers: SseHandlers
): string {
  const next = buffer + chunk;
  const lines = next.split('\n');
  const rest = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) continue;
    const dataStr = trimmed.slice(6);
    try {
      const data = JSON.parse(dataStr) as StreamEvent;
      if (data.type === 'init' && handlers.onInit) {
        handlers.onInit(data.conversationId);
      } else if (data.type === 'token' && handlers.onToken) {
        handlers.onToken(data.token);
      }
    } catch {
      // ignore partial / non-JSON payloads
    }
  }

  return rest;
}

export function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'AbortError'
  );
}
