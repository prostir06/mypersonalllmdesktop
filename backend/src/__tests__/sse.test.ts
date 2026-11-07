import type { Response } from 'express';
import { beginSseStream, writeSse, writeSseEvent } from '../utils/sse';
import logger from '../logger';

jest.mock('../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

describe('sse utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes standard data frame and skips when writableEnded is true', () => {
    const res = {
      writableEnded: false,
      write: jest.fn(),
    } as unknown as Response;

    writeSse(res, { foo: 'bar' });
    expect(res.write).toHaveBeenCalledWith('data: {"foo":"bar"}\n\n');

    (res as any).writableEnded = true;
    writeSse(res, { foo: 'baz' });
    expect(res.write).toHaveBeenCalledTimes(1);
  });

  it('catches and logs warn when res.write throws in writeSse', () => {
    const res = {
      writableEnded: false,
      write: jest.fn().mockImplementation(() => {
        throw new Error('EPIPE');
      }),
    } as unknown as Response;

    writeSse(res, { test: 1 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/SSE write skipped \(client closed\?\): EPIPE/)
    );
  });

  it('writes named event frame via writeSseEvent and catches write errors', () => {
    const res = {
      writableEnded: false,
      write: jest.fn(),
    } as unknown as Response;

    writeSseEvent(res, 'token_usage', { totalTokens: 42 });
    expect(res.write).toHaveBeenCalledWith(
      'event: token_usage\ndata: {"totalTokens":42}\n\n'
    );

    (res.write as jest.Mock).mockImplementationOnce(() => {
      throw new Error('connection reset');
    });

    writeSseEvent(res, 'token_usage', { totalTokens: 100 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/SSE event "token_usage" write skipped \(client closed\?\): connection reset/)
    );
  });

  it('flushes SSE headers and writes a ping comment on the interval', () => {
    jest.useFakeTimers();
    const res = {
      writableEnded: false,
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
    } as unknown as Response;

    const stop = beginSseStream(res, 15_000);
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.flushHeaders).toHaveBeenCalled();

    jest.advanceTimersByTime(15_000);
    expect(res.write).toHaveBeenCalledWith(':ping\n\n');
    stop();
    jest.useRealTimers();
  });
});
