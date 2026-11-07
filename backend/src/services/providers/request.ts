import { lookupModelProfile } from '../../config/models';
import {
  MAX_MAX_TOKENS,
  MAX_TEMPERATURE,
  MIN_MAX_TOKENS,
  MIN_TEMPERATURE,
} from '../../validators/settingsValidator';
import { ChatError } from '../chat/types';
import { isAbortOrCallbackError } from './shared';
import type { NormalizedToolCall } from './types';

export const REQUEST_TIMEOUT_MS = 60_000;
export const REQUEST_MAX_RETRIES = 2;
export const IDLE_STREAM_MS = 60_000;

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;

export class ProviderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}

export type NormalizedSampling = {
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  top_p?: number;
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numeric));
}

/** Clamp sampling and drop parameters the model does not accept. */
export function normalizeOptions(
  model: string | undefined,
  options: { temperature?: unknown; max_tokens?: unknown; top_p?: unknown }
): NormalizedSampling {
  const profile = lookupModelProfile(model);
  const maxTokens = clamp(options.max_tokens, MIN_MAX_TOKENS, MAX_MAX_TOKENS, DEFAULT_MAX_TOKENS);
  const sampling: NormalizedSampling =
    profile?.maxTokensField === 'max_completion_tokens'
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens };
  if (profile?.temperature !== false) {
    sampling.temperature = clamp(
      options.temperature,
      MIN_TEMPERATURE,
      MAX_TEMPERATURE,
      DEFAULT_TEMPERATURE
    );
  }
  if (typeof options.top_p === 'number' && Number.isFinite(options.top_p)) {
    sampling.top_p = Math.min(1, Math.max(0, options.top_p));
  }
  return sampling;
}

export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) controller.abort(options.signal.reason);
  else options.signal?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new ProviderTimeoutError('Час очікування відповіді вичерпано'));
  }, timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  try {
    return await work(controller.signal);
  } catch (error) {
    if (controller.signal.reason instanceof ProviderTimeoutError) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onParentAbort);
  }
}

export function createIdleWatchdog(
  onIdle: () => void,
  idleMs = IDLE_STREAM_MS
): { touch: () => void; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    timer = setTimeout(onIdle, idleMs);
    if (typeof timer.unref === 'function') timer.unref();
  };
  arm();
  return {
    touch() {
      if (timer) clearTimeout(timer);
      arm();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

export function linkAbortSignals(...signals: Array<AbortSignal | undefined>): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const present = signals.filter((signal): signal is AbortSignal => signal instanceof AbortSignal);
  const anySignals = (AbortSignal as { any?: (list: AbortSignal[]) => AbortSignal }).any;
  if (present.length === 0) {
    return { signal: new AbortController().signal, dispose() {} };
  }
  if (anySignals) {
    return { signal: anySignals(present), dispose() {} };
  }
  const controller = new AbortController();
  const listeners: Array<() => void> = [];
  for (const signal of present) {
    const onAbort = () => controller.abort(signal.reason);
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
    listeners.push(() => signal.removeEventListener('abort', onAbort));
  }
  return {
    signal: controller.signal,
    dispose() {
      for (const remove of listeners) remove();
    },
  };
}

type ToolCallDelta = {
  index?: number;
  id?: string;
  call_id?: string;
  name?: string;
  function?: { name?: string; arguments?: unknown };
  arguments?: unknown;
};

function mergeFragment(current: string, next: string): string {
  if (!current) return next;
  if (current === next || next.startsWith(current)) return next;
  return current + next;
}

/** Merge streamed tool-call deltas from OpenAI-compatible providers. */
export function accumulateToolCalls(
  acc: Record<number, NormalizedToolCall>,
  deltas: readonly ToolCallDelta[] | undefined,
  idFallback?: (index: number) => string
): void {
  if (!Array.isArray(deltas)) return;
  for (const call of deltas) {
    const index = call.index ?? 0;
    if (!acc[index]) acc[index] = { id: '', name: '', argumentsJson: '' };
    const slot = acc[index];
    const rawId = call.id || call.call_id;
    if (typeof rawId === 'string' && rawId) slot.id = rawId;
    else if (!slot.id && idFallback) slot.id = idFallback(index);

    const rawName = call.function?.name || call.name;
    if (typeof rawName === 'string' && rawName) slot.name = mergeFragment(slot.name, rawName);

    const rawArgs = call.function?.arguments !== undefined ? call.function.arguments : call.arguments;
    if (typeof rawArgs === 'string') slot.argumentsJson = mergeFragment(slot.argumentsJson, rawArgs);
    else if (rawArgs && typeof rawArgs === 'object') slot.argumentsJson = JSON.stringify(rawArgs);
  }
}

export function finishToolCalls(acc: Record<number, NormalizedToolCall>): NormalizedToolCall[] {
  return Object.keys(acc)
    .map((key) => Number(key))
    .sort((a, b) => a - b)
    .map((index) => acc[index]);
}

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const candidate = record.status ?? record.statusCode ?? record.response?.status;
  return typeof candidate === 'number' ? candidate : undefined;
}

function readCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  const code = (error as { code?: unknown }).code;
  return code == null ? '' : String(code);
}

export function mapProviderError(
  error: unknown,
  fallback: string,
  log?: (detail: string) => void
): never {
  if (isAbortOrCallbackError(error)) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (error instanceof ChatError) throw error;
  if (error instanceof ProviderTimeoutError) {
    throw new ChatError(504, error.message, { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  const status = readStatus(error);
  const code = readCode(error);
  log?.(`${status ? `status=${status} ` : ''}${code ? `code=${code} ` : ''}${message}`.trim());
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    throw new ChatError(504, 'Час очікування відповіді вичерпано', { cause: error });
  }
  if (status === 401) {
    throw new ChatError(401, 'Недійсний ключ API. Перевірте ключ у Налаштуваннях.', {
      cause: error,
    });
  }
  if (status === 429) {
    throw new ChatError(429, 'Перевищено ліміт запитів. Зачекайте або спробуйте іншу модель.', {
      cause: error,
    });
  }
  throw new Error(fallback, { cause: error instanceof Error ? error : undefined });
}
