import { ChatError } from '../services/chat/types';
import {
  IDLE_STREAM_MS,
  accumulateToolCalls,
  createIdleWatchdog,
  finishToolCalls,
  mapProviderError,
  normalizeOptions,
  ProviderTimeoutError,
  withTimeout,
} from '../services/providers/request';
import type { NormalizedToolCall } from '../services/providers/types';

describe('provider request helpers', () => {
  describe('normalizeOptions', () => {
    it('clamps chat sampling and keeps max_tokens', () => {
      expect(normalizeOptions('gpt-4o-mini', { temperature: 9, max_tokens: 99, top_p: 2 })).toEqual({
        temperature: 2,
        max_tokens: 100,
        top_p: 1,
      });
    });

    it('omits temperature and sends max_completion_tokens for o-series and gpt-5', () => {
      expect(normalizeOptions('o3-mini', { temperature: 0.4, max_tokens: 800 })).toEqual({
        max_completion_tokens: 800,
      });
      expect(normalizeOptions('gpt-5.1', { temperature: 1, max_tokens: 500 })).toEqual({
        max_completion_tokens: 500,
      });
    });
  });

  describe('withTimeout', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('aborts the request when the deadline passes', async () => {
      jest.useFakeTimers();
      let requestSignal: AbortSignal | undefined;
      const pending = withTimeout(
        (signal) =>
          new Promise((_resolve, reject) => {
            requestSignal = signal;
            signal.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
        { timeoutMs: 60_000 }
      );
      const assertion = expect(pending).rejects.toBeInstanceOf(ProviderTimeoutError);
      await jest.advanceTimersByTimeAsync(60_000);
      await assertion;
      expect(requestSignal?.aborted).toBe(true);
    });

    it('follows the caller signal', async () => {
      const ac = new AbortController();
      let requestSignal: AbortSignal | undefined;
      const pending = withTimeout(
        (signal) =>
          new Promise((resolve) => {
            requestSignal = signal;
            signal.addEventListener('abort', () => resolve('stopped'));
          }),
        { signal: ac.signal, timeoutMs: 60_000 }
      );
      ac.abort();
      await expect(pending).resolves.toBe('stopped');
      expect(requestSignal?.aborted).toBe(true);
    });
  });

  describe('createIdleWatchdog', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('fires only after a quiet stretch and resets when touched', () => {
      jest.useFakeTimers();
      const onIdle = jest.fn();
      const watchdog = createIdleWatchdog(onIdle, IDLE_STREAM_MS);
      jest.advanceTimersByTime(IDLE_STREAM_MS - 1);
      expect(onIdle).not.toHaveBeenCalled();
      watchdog.touch();
      jest.advanceTimersByTime(IDLE_STREAM_MS - 1);
      expect(onIdle).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(onIdle).toHaveBeenCalledTimes(1);
      watchdog.stop();
      jest.advanceTimersByTime(IDLE_STREAM_MS);
      expect(onIdle).toHaveBeenCalledTimes(1);
    });
  });

  describe('accumulateToolCalls', () => {
    it('appends argument deltas and replaces a cumulative snapshot', () => {
      const acc: Record<number, NormalizedToolCall> = {};
      accumulateToolCalls(acc, [
        { index: 0, id: 'call_1', function: { name: 'cal', arguments: '{"a":' } },
      ]);
      accumulateToolCalls(acc, [
        { index: 0, function: { name: 'c', arguments: '1}' } },
      ]);
      accumulateToolCalls(acc, [
        { index: 0, function: { name: 'calc', arguments: '{"a":1}' } },
      ]);
      expect(finishToolCalls(acc)).toEqual([
        { id: 'call_1', name: 'calc', argumentsJson: '{"a":1}' },
      ]);
    });
  });

  describe('mapProviderError', () => {
    it('keeps an abort as an abort', () => {
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      expect(() => mapProviderError(abortErr, 'fallback')).toThrow(abortErr);
    });

    it('turns a provider timeout into ChatError 504', () => {
      const timeout = new ProviderTimeoutError('Час очікування відповіді вичерпано');
      expect(() => mapProviderError(timeout, 'fallback')).toThrow(ChatError);
      try {
        mapProviderError(timeout, 'fallback');
      } catch (error) {
        expect(error).toBeInstanceOf(ChatError);
        expect((error as ChatError).statusCode).toBe(504);
        expect((error as ChatError).message).toBe(timeout.message);
      }
    });

    it('hides the upstream message behind the fallback', () => {
      expect(() => mapProviderError(new Error('sk-secret'), 'Failed to communicate')).toThrow(
        'Failed to communicate'
      );
    });
  });
});
