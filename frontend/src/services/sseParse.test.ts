import { describe, it, expect, vi } from 'vitest';
import { consumeSseChunk, isAbortError } from './sseParse';

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

  it('ignores malformed JSON lines', () => {
    const onToken = vi.fn();
    const rest = consumeSseChunk('', 'data: {not-json}\n', { onToken });
    expect(onToken).not.toHaveBeenCalled();
    expect(rest).toBe('');
  });
});

describe('isAbortError', () => {
  it('detects AbortError by name', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('fail'))).toBe(false);
  });
});
