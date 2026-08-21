/**
 * Pure SSE helpers for chat streaming (unit-tested).
 * Keeps buffer state out of React and out of the Axios client.
 */
import type { RagSource, StreamEvent } from '../types/api';

/** Raised when the server sends `data: {"type":"error",...}` mid-stream. */
export class SseStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SseStreamError';
  }
}

export type SseHandlers = {
  onToken?: (token: string) => void;
  onInit?: (
    conversationId: string | number,
    ragStatus?: 'ok' | 'empty' | 'error' | 'skipped'
  ) => void;
  onDone?: (payload: {
    messageId?: string | number;
    content?: string;
    sources?: RagSource[];
    ragStatus?: 'ok' | 'empty' | 'error' | 'skipped';
  }) => void;
  /** Called before SseStreamError is thrown (optional telemetry). */
  onError?: (message: string) => void;
};

function safeInvoke(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    // Handler bugs must not kill the SSE parse loop, but surface them for debugging.
    console.warn('SSE handler error:', err);
  }
}

/**
 * Append a chunk to the SSE buffer and dispatch complete `data:` events.
 * Returns the leftover incomplete buffer (partial line).
 * Throws {@link SseStreamError} when the server reports a stream error.
 */
export function consumeSseChunk(
  buffer: string,
  chunk: string,
  handlers: SseHandlers
): string {
  // Normalize CRLF / lone CR so line splits match browser/nginx variants
  const next = `${buffer}${chunk}`.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = next.split('\n');
  const rest = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) continue;
    if (!trimmed.startsWith('data:')) continue;

    // Support both `data: {...}` and `data:{...}`
    const dataStr = trimmed.startsWith('data: ')
      ? trimmed.slice(6)
      : trimmed.slice(5).trimStart();

    if (!dataStr || dataStr === '[DONE]') continue;

    let data: StreamEvent;
    try {
      data = JSON.parse(dataStr) as StreamEvent;
    } catch {
      // Partial / non-JSON payloads — wait for more bytes
      continue;
    }

    try {
      if (data.type === 'init' && handlers.onInit) {
        safeInvoke(() => handlers.onInit!(data.conversationId, data.ragStatus));
      } else if (data.type === 'token' && handlers.onToken) {
        safeInvoke(() => handlers.onToken!(data.token));
      } else if (data.type === 'done' && handlers.onDone) {
        safeInvoke(() =>
          handlers.onDone!({
            messageId: data.messageId,
            content: data.content,
            sources: data.sources,
            ragStatus: data.ragStatus,
          })
        );
      } else if (data.type === 'error') {
        const message =
          typeof data.error === 'string' && data.error
            ? data.error
            : 'Stream error';
        if (handlers.onError) {
          safeInvoke(() => handlers.onError!(message));
        }
        throw new SseStreamError(message);
      }
    } catch (err) {
      if (err instanceof SseStreamError) throw err;
      console.warn('SSE dispatch error:', err);
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

export function isSseStreamError(err: unknown): err is SseStreamError {
  return err instanceof SseStreamError || (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'SseStreamError'
  );
}

/**
 * Best-effort parse of a failed HTTP stream response body (JSON or text).
 */
export async function readFetchErrorMessage(
  response: Response
): Promise<string> {
  const fallback = `HTTP error! status: ${response.status}`;
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const json = JSON.parse(text) as { error?: unknown; details?: unknown };
      if (typeof json.error === 'string' && json.error) return json.error;
      if (typeof json.details === 'string' && json.details) return json.details;
    } catch {
      return text.slice(0, 200);
    }
  } catch {
    // Body already consumed or network glitch while reading error text
  }
  return fallback;
}
