const mockCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import openaiService from '../services/openaiService';
import logger from '../logger';

const { executeTool, sendOpenAIMessage, streamOpenAIMessage } = openaiService;

describe('openaiService (SDK)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    (logger.error as jest.Mock).mockClear();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  describe('executeTool', () => {
    it('calculates safe expressions', () => {
      expect(executeTool('calculate', { expression: '2 + 2' })).toBe('4');
    });

    it('rejects exponentiation **', () => {
      const result = executeTool('calculate', { expression: '2**1024' });
      expect(result).toMatch(/Error|Недійсний|invalid|Exponentiation/i);
    });

    it('rejects identifier injection', () => {
      const result = executeTool('calculate', {
        expression: 'process.exit(1)',
      });
      expect(result).toMatch(/Error/i);
    });

    it('evaluates precedence without Function', () => {
      expect(executeTool('calculate', { expression: '1+2*3' })).toBe('7');
    });
  });

  describe('sendOpenAIMessage', () => {
    it('omits tools when enableTools is not true', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Hi', role: 'assistant' } }],
        usage: { total_tokens: 1 },
        model: 'gpt-3.5-turbo',
      });

      const result = await sendOpenAIMessage(
        [{ role: 'user', content: 'x' }],
        'gpt-3.5-turbo',
        {
          temperature: 0.2,
          ollama_host: 'http://x',
          tools: [{ type: 'function' }],
        }
      );

      expect(result.content).toBe('Hi');
      const arg = mockCreate.mock.calls[0][0];
      expect(arg.tools).toBeUndefined();
      expect(arg.tool_choice).toBeUndefined();
      expect(arg.temperature).toBe(0.2);
      expect(arg.ollama_host).toBeUndefined();
    });

    it('runs tool_calls when enableTools true', async () => {
      mockCreate
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'calculate',
                      arguments: '{"expression":"2+2"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: {},
          model: 'gpt-3.5-turbo',
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: '4', role: 'assistant' } }],
          usage: { total_tokens: 5 },
          model: 'gpt-3.5-turbo',
        });

      const result = await sendOpenAIMessage(
        [{ role: 'user', content: 'calc' }],
        'gpt-3.5-turbo',
        { enableTools: true }
      );

      expect(result.content).toBe('4');
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(mockCreate.mock.calls[0][0].tools).toBeDefined();
      expect(mockCreate.mock.calls[1][0].tools).toBeUndefined();
      const secondMessages = mockCreate.mock.calls[1][0].messages;
      expect(
        secondMessages.some((m: { role: string }) => m.role === 'tool')
      ).toBe(true);
    });

    it('surfaces invalid tool JSON instead of running tool with empty args', async () => {
      mockCreate
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_bad',
                    type: 'function',
                    function: {
                      name: 'calculate',
                      arguments: '{not-json',
                    },
                  },
                ],
              },
            },
          ],
          usage: {},
          model: 'gpt-3.5-turbo',
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'sorry', role: 'assistant' } }],
          usage: { total_tokens: 2 },
          model: 'gpt-3.5-turbo',
        });

      const result = await sendOpenAIMessage(
        [{ role: 'user', content: 'calc' }],
        'gpt-3.5-turbo',
        { enableTools: true }
      );

      expect(result.content).toBe('sorry');
      const toolMsg = mockCreate.mock.calls[1][0].messages.find(
        (m: { role: string }) => m.role === 'tool'
      );
      expect(toolMsg.content).toMatch(/Error parsing tool arguments/i);
    });

    it('throws generic error on failure', async () => {
      mockCreate.mockRejectedValue(new Error('sk-secret-leak'));
      await expect(
        sendOpenAIMessage([{ role: 'user', content: 'x' }])
      ).rejects.toThrow('Failed to communicate with OpenAI API');
      try {
        await sendOpenAIMessage([{ role: 'user', content: 'x' }]);
      } catch (e: unknown) {
        expect(String(e)).not.toMatch(/sk-secret/);
      }
    });
  });

  describe('streamOpenAIMessage', () => {
    it('emits tokens from async iterator', async () => {
      async function* gen() {
        yield { choices: [{ delta: { content: 'Hel' } }] };
        yield { choices: [{ delta: { content: 'lo' } }] };
      }
      mockCreate.mockResolvedValueOnce(gen());
      const onChunk = jest.fn();
      const result = await streamOpenAIMessage(
        [{ role: 'user', content: 'Hi' }],
        'gpt-3.5-turbo',
        { enableTools: true },
        onChunk
      );
      expect(result.content).toBe('Hello');
      expect(onChunk.mock.calls.map((c) => c[0]).join('')).toBe('Hello');
      expect(mockCreate.mock.calls[0][0].stream).toBe(true);
      expect(mockCreate.mock.calls[0][0].tools).toBeUndefined();
    });

    it('forwards AbortSignal to OpenAI client', async () => {
      async function* gen() {
        yield { choices: [{ delta: { content: 'x' } }] };
      }
      mockCreate.mockResolvedValueOnce(gen());
      const ac = new AbortController();
      await streamOpenAIMessage(
        [{ role: 'user', content: 'Hi' }],
        'gpt-3.5-turbo',
        { signal: ac.signal },
        jest.fn()
      );
      expect(mockCreate.mock.calls[0][1]).toEqual({ signal: ac.signal });
    });

    it('rethrows AbortError from onChunk callback', async () => {
      async function* gen() {
        yield { choices: [{ delta: { content: 'x' } }] };
      }
      mockCreate.mockResolvedValueOnce(gen());
      const abortErr = new DOMException('Aborted', 'AbortError');
      const onChunk = jest.fn().mockImplementation(() => {
        throw abortErr;
      });
      await expect(
        streamOpenAIMessage(
          [{ role: 'user', content: 'Hi' }],
          'gpt-3.5-turbo',
          {},
          onChunk
        )
      ).rejects.toThrow('Aborted');
    });

    it('swallows non-abort onChunk errors and continues', async () => {
      async function* gen() {
        yield { choices: [{ delta: { content: 'A' } }] };
        yield { choices: [{ delta: { content: 'B' } }] };
      }
      mockCreate.mockResolvedValueOnce(gen());
      let callCount = 0;
      const onChunk = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('UI crash');
      });
      const result = await streamOpenAIMessage(
        [{ role: 'user', content: 'Hi' }],
        'gpt-3.5-turbo',
        {},
        onChunk
      );
      expect(result.content).toBe('AB');
      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('UI crash')
      );
    });

    it('logs the original stream error before throwing a generic one', async () => {
      mockCreate.mockRejectedValue(new Error('upstream timeout'));
      await expect(
        streamOpenAIMessage([{ role: 'user', content: 'Hi' }])
      ).rejects.toThrow('Failed to stream from OpenAI API');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('upstream timeout')
      );
    });
  });
});
