import {
  bindClientAbortSignal,
  isAbortError,
} from '../utils/requestAbort';

function fakePair() {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    writableEnded: false,
    on: (event: string, cb: () => void) => {
      (listeners[event] ||= []).push(cb);
    },
  };
  const req = { on: jest.fn() };
  return { req, res, listeners };
}

describe('requestAbort', () => {
  it('aborts when the response closes before it finishes', () => {
    const { req, res, listeners } = fakePair();
    const signal = bindClientAbortSignal(req as any, res as any);
    listeners.close.forEach((cb) => cb());
    expect(signal.aborted).toBe(true);
    expect(req.on).not.toHaveBeenCalled();
  });

  it('does not abort when the response already finished', () => {
    const { req, res, listeners } = fakePair();
    res.writableEnded = true;
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
