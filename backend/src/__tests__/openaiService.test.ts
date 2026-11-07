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
import { ChatError } from '../services/chat/types';

const { sendOpenAIMessage, streamOpenAIMessage } = openaiService;

describe('openaiService (SDK)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    (logger.error as jest.Mock).mockClear();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  describe('apiKey validation', () => {
    beforeEach(() => {
      delete process.env.OPENAI_API_KEY;
    });

    it('sendOpenAIMessage throws when no apiKey provided and env is empty', async () => {
      await expect(
        sendOpenAIMessage([{ role: 'user', content: 'hi' }])
      ).rejects.toThrow('OpenAI API key is not configured');
    });

    it('sendOpenAIMessage throws when apiKey is placeholder', async () => {
      await expect(
        sendOpenAIMessage([{ role: 'user', content: 'hi' }], 'gpt-3.5-turbo', {
          apiKey: 'your_openai_api_key_here',
        })
      ).rejects.toThrow('OpenAI API key is not configured');
    });

    it('streamOpenAIMessage throws when no apiKey provided and env is empty', async () => {
      await expect(
        streamOpenAIMessage([{ role: 'user', content: 'hi' }])
      ).rejects.toThrow('OpenAI API key is not configured');
    });

    it('streamOpenAIMessage throws when apiKey is placeholder', async () => {
      await expect(
        streamOpenAIMessage([{ role: 'user', content: 'hi' }], 'gpt-3.5-turbo', {
          apiKey: 'sk-your-key',
        })
      ).rejects.toThrow('OpenAI API key is not configured');
    });
  });

  describe('sendOpenAIMessage', () => {
    it('omits tools and unused provider options', async () => {
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
        }
      );

      expect(result.content).toBe('Hi');
      const arg = mockCreate.mock.calls[0][0];
      expect(arg.tools).toBeUndefined();
      expect(arg.tool_choice).toBeUndefined();
      expect(arg.temperature).toBe(0.2);
      expect(arg.max_tokens).toBe(4096);
      expect(arg.ollama_host).toBeUndefined();
      expect(mockCreate.mock.calls[0][1]).toMatchObject({
        timeout: 60_000,
        maxRetries: 2,
      });
      expect(mockCreate.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });

    it('drops temperature and uses max_completion_tokens for reasoning models', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'ok', role: 'assistant' } }],
        usage: { total_tokens: 1 },
        model: 'o3',
      });

      await sendOpenAIMessage([{ role: 'user', content: 'x' }], 'o3', {
        temperature: 0.4,
        max_tokens: 800,
      });

      const arg = mockCreate.mock.calls[0][0];
      expect(arg.temperature).toBeUndefined();
      expect(arg.max_tokens).toBeUndefined();
      expect(arg.max_completion_tokens).toBe(800);
    });

    it('preserves underlying cause when OpenAI API fails', async () => {
      const originalErr = new Error('Rate limit exceeded');
      (originalErr as any).status = 429;
      mockCreate.mockRejectedValueOnce(originalErr);

      let caught: any;
      try {
        await sendOpenAIMessage([{ role: 'user', content: 'test' }]);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ChatError);
      expect(caught.statusCode).toBe(429);
      expect(caught.message).toBe('Перевищено ліміт запитів. Зачекайте або спробуйте іншу модель.');
      expect(caught.cause).toBe(originalErr);
    });

    it('maps response.usage to tokenUsage with estimated cost', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Answer', role: 'assistant' } }],
        usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
        model: 'gpt-4o-mini',
      });

      const result = await sendOpenAIMessage(
        [{ role: 'user', content: 'x' }],
        'gpt-4o-mini'
      );

      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.promptTokens).toBe(1000);
      expect(result.tokenUsage?.completionTokens).toBe(500);
      expect(result.tokenUsage?.totalTokens).toBe(1500);
      expect(result.tokenUsage?.estimatedCostUsd).toBeCloseTo(0.00045, 5);
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
      const passed = mockCreate.mock.calls[0][1].signal as AbortSignal;
      expect(passed.aborted).toBe(false);
      ac.abort();
      expect(passed.aborted).toBe(true);
      expect(mockCreate.mock.calls[0][1].maxRetries).toBe(2);
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

    it('logs and rethrows non-abort onChunk errors', async () => {
      async function* gen() {
        yield { choices: [{ delta: { content: 'A' } }] };
        yield { choices: [{ delta: { content: 'B' } }] };
      }
      mockCreate.mockResolvedValueOnce(gen());
      const onChunk = jest.fn().mockImplementation(() => {
        throw new Error('UI crash');
      });
      await expect(
        streamOpenAIMessage(
          [{ role: 'user', content: 'Hi' }],
          'gpt-3.5-turbo',
          {},
          onChunk
        )
      ).rejects.toThrow('UI crash');
      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('UI crash')
      );
    });

    it('captures tokenUsage from stream chunks and requests include_usage', async () => {
      async function* gen() {
        yield { choices: [{ delta: { content: 'Hi' } }] };
        yield {
          choices: [],
          usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
        };
      }
      mockCreate.mockResolvedValueOnce(gen());
      const result = await streamOpenAIMessage(
        [{ role: 'user', content: 'Hi' }],
        'gpt-4o-mini'
      );
      expect(result.content).toBe('Hi');
      expect(mockCreate.mock.calls[0][0].stream_options).toEqual({ include_usage: true });
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.promptTokens).toBe(1000);
      expect(result.tokenUsage?.completionTokens).toBe(500);
      expect(result.tokenUsage?.totalTokens).toBe(1500);
      expect(result.tokenUsage?.estimatedCostUsd).toBeCloseTo(0.00045, 5);
    });

    it('logs the original stream error and preserves cause when throwing generic error', async () => {
      const upstreamErr = new Error('upstream timeout');
      mockCreate.mockRejectedValue(upstreamErr);
      let caught: any;
      try {
        await streamOpenAIMessage([{ role: 'user', content: 'Hi' }]);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toBe('Failed to stream from OpenAI API');
      expect(caught.cause).toBe(upstreamErr);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('upstream timeout')
      );
    });
  });
});
