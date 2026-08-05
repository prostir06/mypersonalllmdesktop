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

import openaiService = require('../services/openaiService');

const { executeTool, sendOpenAIMessage, streamOpenAIMessage } = openaiService;

describe('openaiService (SDK)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
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
  });
});
