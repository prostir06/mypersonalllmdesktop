import {
  buildTokenUsage,
  isAbortOrCallbackError,
  invokeStreamTokenCallback,
} from '../services/providers/shared';
import type {
  ProviderId,
  NormalizedToolCall,
  ToolDefinitionSpec,
  ModelCapabilityFlags,
  ProviderSendResult,
} from '../services/providers/types';

describe('providers/shared utilities', () => {
  it('buildTokenUsage computes totalTokens and attaches estimatedCostUsd', () => {
    const usage = buildTokenUsage(1000, 500, 'gpt-4o-mini');
    expect(usage.promptTokens).toBe(1000);
    expect(usage.completionTokens).toBe(500);
    expect(usage.totalTokens).toBe(1500);
    expect(typeof usage.estimatedCostUsd).toBe('number');
  });

  it('buildTokenUsage handles explicit totalTokens and clamps negative/fractional numbers', () => {
    const withExplicit = buildTokenUsage(100.8, 50.2, 'gpt-4o-mini', 200.9);
    expect(withExplicit.promptTokens).toBe(100);
    expect(withExplicit.completionTokens).toBe(50);
    expect(withExplicit.totalTokens).toBe(200);

    const withNegative = buildTokenUsage(-10, -5, 'gpt-4o-mini');
    expect(withNegative.promptTokens).toBe(0);
    expect(withNegative.completionTokens).toBe(0);
    expect(withNegative.totalTokens).toBe(0);
  });

  it('isAbortOrCallbackError identifies AbortError, ABORT_ERR, and StreamCallbackError', () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const nodeAbort = Object.assign(new Error('aborted'), { code: 'ABORT_ERR' });
    const cbErr = Object.assign(new Error('cb failed'), {
      name: 'StreamCallbackError',
    });
    const normalErr = new Error('network timeout');

    expect(isAbortOrCallbackError(abortErr)).toBe(true);
    expect(isAbortOrCallbackError(nodeAbort)).toBe(true);
    expect(isAbortOrCallbackError(cbErr)).toBe(true);
    expect(isAbortOrCallbackError(normalErr)).toBe(false);
    expect(isAbortOrCallbackError(null)).toBe(false);
    expect(isAbortOrCallbackError(undefined)).toBe(false);
    expect(isAbortOrCallbackError('error string')).toBe(false);
    expect(isAbortOrCallbackError({})).toBe(false);
  });

  it('invokeStreamTokenCallback wraps non-abort callback errors as StreamCallbackError', () => {
    const logs: string[] = [];
    expect(() =>
      invokeStreamTokenCallback(
        () => {
          throw new Error('broken socket');
        },
        'hello',
        (m: string) => logs.push(m)
      )
    ).toThrow(expect.objectContaining({ name: 'StreamCallbackError' }));
    expect(logs[0]).toContain('broken socket');
  });

  it('invokeStreamTokenCallback handles empty token, missing onChunk, and rethrows abort errors without wrapping', () => {
    const logs: string[] = [];
    const dummyChunk = jest.fn();

    // Missing onChunk does nothing
    expect(() => invokeStreamTokenCallback(undefined, 'chunk', (m: string) => logs.push(m))).not.toThrow();

    // Empty token does nothing
    expect(() => invokeStreamTokenCallback(dummyChunk, '', (m: string) => logs.push(m))).not.toThrow();
    expect(dummyChunk).not.toHaveBeenCalled();

    // Normal invocation calls onChunk
    invokeStreamTokenCallback(dummyChunk, 'data', (m: string) => logs.push(m));
    expect(dummyChunk).toHaveBeenCalledWith('data');

    // Rethrows abort error without wrapping
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(() =>
      invokeStreamTokenCallback(
        () => {
          throw abortErr;
        },
        'token',
        (m: string) => logs.push(m)
      )
    ).toThrow(abortErr);

    // Non-Error thrown object is wrapped
    expect(() =>
      invokeStreamTokenCallback(
        () => {
          throw 'plain string failure';
        },
        'token',
        (m: string) => logs.push(m)
      )
    ).toThrow(expect.objectContaining({ name: 'StreamCallbackError', message: 'plain string failure' }));
  });

  it('verifies provider types compile cleanly', () => {
    const provider: ProviderId = 'openai';
    const toolCall: NormalizedToolCall = {
      id: 'call_1',
      name: 'lookup',
      argumentsJson: '{}',
    };
    const spec: ToolDefinitionSpec = {
      name: 'lookup',
      description: 'lookup something',
      parameters: { type: 'object' },
    };
    const flags: ModelCapabilityFlags = {
      vision: true,
      tools: true,
      webSearchGrounding: false,
    };
    const result: ProviderSendResult = {
      content: 'hello',
      model: 'gpt-4o',
      toolCalls: [toolCall],
    };

    expect(provider).toBe('openai');
    expect(toolCall.id).toBe('call_1');
    expect(spec.name).toBe('lookup');
    expect(flags.vision).toBe(true);
    expect(result.content).toBe('hello');
  });
});
