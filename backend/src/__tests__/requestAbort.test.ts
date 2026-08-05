import {
  bindClientAbortSignal,
  isAbortError,
} from '../utils/requestAbort';

describe('requestAbort', () => {
  it('aborts when req closes before response ends', () => {
    const listeners: Record<string, Array<() => void>> = {};
    const req = {
      on: (event: string, cb: () => void) => {
        (listeners[event] ||= []).push(cb);
      },
    };
    const res = { writableEnded: false, on: jest.fn() };

    const signal = bindClientAbortSignal(req as any, res as any);
    expect(signal.aborted).toBe(false);

    listeners.close.forEach((cb) => cb());
    expect(signal.aborted).toBe(true);
  });

  it('does not abort after response has ended', () => {
    const listeners: Record<string, Array<() => void>> = {};
    const req = {
      on: (event: string, cb: () => void) => {
        (listeners[event] ||= []).push(cb);
      },
    };
    const res = { writableEnded: true, on: jest.fn() };

    const signal = bindClientAbortSignal(req as any, res as any);
    listeners.close.forEach((cb) => cb());
    expect(signal.aborted).toBe(false);
  });

  it('detects abort-like errors', () => {
    expect(isAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(
      true
    );
    expect(isAbortError(Object.assign(new Error('x'), { code: 'ERR_CANCELED' }))).toBe(
      true
    );
    expect(isAbortError(new Error('other'))).toBe(false);
  });
});
