import { describe, it, expect, vi } from 'vitest';
import {
  consumeSseChunk,
  isAbortError,
  isSseStreamError,
  readFetchErrorMessage,
  SseStreamError,
} from './sseParse';

describe('consumeSseChunk', () => {
  it('parses init and token events from complete lines', () => {
    const onInit = vi.fn();
    const onToken = vi.fn();
    const rest = consumeSseChunk(
      '',
      'data: {"type":"init","conversationId":12}\n' +
        'data: {"type":"token","token":"Hi"}\n' +
        'data: {"type":"token","token":"!"}\n',
      { onInit, onToken }
    );

    expect(rest).toBe('');
    expect(onInit).toHaveBeenCalledWith(12);
    expect(onToken.mock.calls.map((c) => c[0])).toEqual(['Hi', '!']);
  });

  it('keeps incomplete trailing line in buffer', () => {
    const onToken = vi.fn();
    const rest = consumeSseChunk(
      '',
      'data: {"type":"token","token":"A"}\ndata: {"type":"tok',
      { onToken }
    );

    expect(onToken).toHaveBeenCalledWith('A');
    expect(rest).toBe('data: {"type":"tok');
  });

  it('assembles events split across chunks', () => {
    const onToken = vi.fn();
    const mid = consumeSseChunk('', 'data: {"type":"token","tok', { onToken });
    expect(onToken).not.toHaveBeenCalled();
    const rest = consumeSseChunk(mid, 'en":"Z"}\n', { onToken });
    expect(onToken).toHaveBeenCalledWith('Z');
    expect(rest).toBe('');
  });

  it('normalizes CRLF and ignores comment lines', () => {
    const onToken = vi.fn();
    const rest = consumeSseChunk(
      '',
      ': keep-alive\r\ndata: {"type":"token","token":"X"}\r\n',
      { onToken }
    );
    expect(onToken).toHaveBeenCalledWith('X');
    expect(rest).toBe('');
  });

  it('ignores malformed JSON lines', () => {
    const onToken = vi.fn();
    const rest = consumeSseChunk('', 'data: {not-json}\n', { onToken });
    expect(onToken).not.toHaveBeenCalled();
    expect(rest).toBe('');
  });

  it('invokes onDone for done events', () => {
    const onDone = vi.fn();
    consumeSseChunk(
      '',
      'data: {"type":"done","messageId":9,"content":"ok","sources":[{"filename":"a.txt","similarity":0.9}]}\n',
      { onDone }
    );
    expect(onDone).toHaveBeenCalledWith({
      messageId: 9,
      content: 'ok',
      sources: [{ filename: 'a.txt', similarity: 0.9 }],
    });
  });

  it('throws SseStreamError on server error events', () => {
    const onError = vi.fn();
    expect(() =>
      consumeSseChunk(
        '',
        'data: {"type":"error","error":"provider boom"}\n',
        { onError }
      )
    ).toThrow(SseStreamError);
    expect(onError).toHaveBeenCalledWith('provider boom');
  });

  it('continues when a handler throws', () => {
    const onToken = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('ui boom');
      })
      .mockImplementationOnce(() => {});

    const rest = consumeSseChunk(
      '',
      'data: {"type":"token","token":"A"}\ndata: {"type":"token","token":"B"}\n',
      { onToken }
    );

    expect(onToken).toHaveBeenCalledTimes(2);
    expect(rest).toBe('');
  });
});

describe('isAbortError / isSseStreamError', () => {
  it('detects AbortError by name', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('fail'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });

  it('detects SseStreamError', () => {
    expect(isSseStreamError(new SseStreamError('x'))).toBe(true);
    expect(isSseStreamError(new Error('x'))).toBe(false);
  });
});

describe('readFetchErrorMessage', () => {
  it('prefers JSON error field', async () => {
    const response = new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
    });
    await expect(readFetchErrorMessage(response)).resolves.toBe('Forbidden');
  });

  it('falls back to status text when body is empty', async () => {
    const response = new Response(null, { status: 500 });
    await expect(readFetchErrorMessage(response)).resolves.toBe(
      'HTTP error! status: 500'
    );
  });

  it('uses plain text body when not JSON', async () => {
    const response = new Response('plain failure', { status: 502 });
    await expect(readFetchErrorMessage(response)).resolves.toBe('plain failure');
  });
});
