const mockMessagesCreate = jest.fn();
const mockMessagesStream = jest.fn();

class MockAPIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'APIError';
  }
}

class MockAuthenticationError extends MockAPIError {
  constructor(message = 'Invalid API Key') {
    super(401, message);
    this.name = 'AuthenticationError';
  }
}

class MockRateLimitError extends MockAPIError {
  constructor(message = 'Rate limit exceeded') {
    super(429, message);
    this.name = 'RateLimitError';
  }
}

const MockAnthropic: any = jest.fn().mockImplementation(() => ({
  messages: {
    create: mockMessagesCreate,
    stream: mockMessagesStream,
  },
}));

MockAnthropic.APIError = MockAPIError;
MockAnthropic.AuthenticationError = MockAuthenticationError;
MockAnthropic.RateLimitError = MockRateLimitError;

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: MockAnthropic,
    Anthropic: MockAnthropic,
    APIError: MockAPIError,
    AuthenticationError: MockAuthenticationError,
    RateLimitError: MockRateLimitError,
  };
});

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import claudeService, {
  formatClaudeMessages,
  formatClaudeTokenUsage,
} from '../services/claudeService';
import { ChatError } from '../services/chat/types';

describe('claudeService', () => {
  const origEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(() => {
    if (origEnv !== undefined) {
      process.env.ANTHROPIC_API_KEY = origEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  describe('apiKey validation', () => {
    it('throws ChatError 400 when API key is missing in sendClaudeMessage', async () => {
      await expect(
        claudeService.sendClaudeMessage(
          [{ role: 'user', content: 'Hello' }],
          'claude-3-5-sonnet-20241022',
          {}
        )
      ).rejects.toThrow('Anthropic Claude API key не налаштовано');
    });

    it('throws ChatError 400 when API key is blank in streamClaudeMessage', async () => {
      await expect(
        claudeService.streamClaudeMessage(
          [{ role: 'user', content: 'Hello' }],
          'claude-3-5-sonnet-20241022',
          { apiKey: '   ' }
        )
      ).rejects.toThrow('Anthropic Claude API key не налаштовано');
    });

    it('uses process.env.ANTHROPIC_API_KEY as fallback when options.apiKey is omitted', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-env-key';
      mockMessagesCreate.mockResolvedValueOnce({
        id: 'msg_env',
        content: [{ type: 'text', text: 'Hello from env key' }],
        role: 'assistant',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const res = await claudeService.sendClaudeMessage(
        [{ role: 'user', content: 'Hi' }],
        'claude-3-5-sonnet-20241022'
      );

      expect(MockAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-ant-env-key' })
      );
      expect(res.content).toBe('Hello from env key');
    });
  });

  describe('formatClaudeMessages', () => {
    it('extracts system messages into system prompt string and keeps non-system in messages array', () => {
      const input = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'system', content: 'Second instruction.' },
        { role: 'user', content: 'What is 2+2?' },
      ];

      const { messages, system } = formatClaudeMessages(input);
      expect(system).toBe('You are a helpful assistant.\n\nSecond instruction.');
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toEqual([
        { type: 'text', text: 'What is 2+2?' },
      ]);
    });

    it('formats multimodal base64 image attachments into Claude image content blocks', () => {
      const input = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image' },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              },
            },
          ],
        },
      ];

      const { messages } = formatClaudeMessages(input);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toEqual([
        { type: 'text', text: 'Describe this image' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          },
        },
      ]);
    });

    it('attaches options.image to the user message if provided', () => {
      const input = [{ role: 'user', content: 'Analyze chart' }];
      const options = {
        image: 'data:image/jpeg;base64,dGVzdGpwZWc=',
      };

      const { messages } = formatClaudeMessages(input, options);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toEqual([
        { type: 'text', text: 'Analyze chart' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: 'dGVzdGpwZWc=',
          },
        },
      ]);
    });

    it('merges consecutive messages of the same role to maintain alternating conversation structure', () => {
      const input = [
        { role: 'user', content: 'First message' },
        { role: 'user', content: 'Second message' },
        { role: 'assistant', content: 'Assistant reply' },
      ];

      const { messages } = formatClaudeMessages(input);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toEqual([
        { type: 'text', text: 'First message' },
        { type: 'text', text: 'Second message' },
      ]);
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toEqual([
        { type: 'text', text: 'Assistant reply' },
      ]);
    });
  });

  describe('formatClaudeTokenUsage', () => {
    it('calculates token counts and estimated cost using tokenCostCalculator', () => {
      const usage = formatClaudeTokenUsage(
        { input_tokens: 1000, output_tokens: 500 },
        'claude-3-5-sonnet-20241022'
      );
      expect(usage).toBeDefined();
      expect(usage?.promptTokens).toBe(1000);
      expect(usage?.completionTokens).toBe(500);
      expect(usage?.totalTokens).toBe(1500);
      // Sonnet: prompt = $3.00/1M ($0.003), completion = $15.00/1M ($0.0075) => total = $0.0105
      expect(usage?.estimatedCostUsd).toBe(0.0105);
    });

    it('returns undefined if usage is missing', () => {
      expect(formatClaudeTokenUsage(undefined)).toBeUndefined();
    });
  });

  describe('sendClaudeMessage', () => {
    it('calls client.messages.create and returns content, tokenUsage, and model', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        id: 'msg_001',
        content: [
          { type: 'text', text: '4' },
        ],
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 15, output_tokens: 2 },
      });

      const res = await claudeService.sendClaudeMessage(
        [
          { role: 'system', content: 'Math helper' },
          { role: 'user', content: '2 + 2?' },
        ],
        'claude-3-5-sonnet-20241022',
        { apiKey: 'sk-ant-valid-key', temperature: 0.5, max_tokens: 1024 }
      );

      expect(mockMessagesCreate).toHaveBeenCalledWith({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        temperature: 0.5,
        system: 'Math helper',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: '2 + 2?' }],
          },
        ],
      });

      expect(res.content).toBe('4');
      expect(res.model).toBe('claude-3-5-sonnet-20241022');
      expect(res.tokenUsage).toMatchObject({
        promptTokens: 15,
        completionTokens: 2,
        totalTokens: 17,
      });
      expect(res.tokenUsage?.estimatedCostUsd).toBeDefined();
    });
  });

  describe('streamClaudeMessage', () => {
    it('streams text chunks via onChunk and returns final content and tokenUsage', async () => {
      mockMessagesStream.mockImplementationOnce(() => {
        const streamObj: any = {
          controller: { abort: jest.fn() },
          on: jest.fn((event: string, handler: (...args: any[]) => void) => {
            if (event === 'text') {
              process.nextTick(() => {
                handler('Hello');
                handler(' world');
                handler('!');
              });
            }
            return streamObj;
          }),
          finalMessage: jest.fn().mockImplementation(async () => {
            await new Promise((r) => setImmediate(r));
            return {
              id: 'msg_stream_1',
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello world!' }],
              model: 'claude-3-5-sonnet-20241022',
              usage: { input_tokens: 12, output_tokens: 3 },
            };
          }),
        };
        return streamObj;
      });

      const chunks: string[] = [];
      const onChunk = (c: string) => chunks.push(c);

      const res = await claudeService.streamClaudeMessage(
        [{ role: 'user', content: 'Say hello' }],
        'claude-3-5-sonnet-20241022',
        { apiKey: 'sk-ant-test' },
        onChunk
      );

      expect(res.content).toBe('Hello world!');
      expect(chunks).toEqual(['Hello', ' world', '!']);
      expect(res.tokenUsage?.promptTokens).toBe(12);
      expect(res.tokenUsage?.completionTokens).toBe(3);
    });

    it('propagates options.signal abort to stream controller', async () => {
      const abortController = new AbortController();
      let streamAbortCalled = false;

      mockMessagesStream.mockImplementationOnce(() => {
        const streamObj: any = {
          controller: {
            abort: jest.fn().mockImplementation(() => {
              streamAbortCalled = true;
            }),
          },
          on: jest.fn().mockReturnThis(),
          finalMessage: jest.fn().mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 20));
            const err = new Error('Request was aborted.');
            err.name = 'APIUserAbortError';
            throw err;
          }),
        };
        return streamObj;
      });

      const promise = claudeService.streamClaudeMessage(
        [{ role: 'user', content: 'Long generation' }],
        'claude-3-5-sonnet-20241022',
        { apiKey: 'sk-ant-test', signal: abortController.signal }
      );

      setTimeout(() => {
        abortController.abort();
      }, 5);

      await expect(promise).rejects.toMatchObject({
        name: 'AbortError',
      });
      expect(streamAbortCalled).toBe(true);
    });

    it('throws AbortError immediately if signal is already aborted', async () => {
      const ac = new AbortController();
      ac.abort();

      await expect(
        claudeService.sendClaudeMessage(
          [{ role: 'user', content: 'test' }],
          'claude-3-5-sonnet-20241022',
          { apiKey: 'sk-ant-test', signal: ac.signal }
        )
      ).rejects.toMatchObject({ name: 'AbortError' });

      await expect(
        claudeService.streamClaudeMessage(
          [{ role: 'user', content: 'test' }],
          'claude-3-5-sonnet-20241022',
          { apiKey: 'sk-ant-test', signal: ac.signal }
        )
      ).rejects.toMatchObject({ name: 'AbortError' });
    });
  });

  describe('error mapping', () => {
    it('maps 401 AuthenticationError to localized ChatError 401', async () => {
      mockMessagesCreate.mockRejectedValueOnce(
        new MockAuthenticationError('Invalid x-api-key')
      );

      await expect(
        claudeService.sendClaudeMessage(
          [{ role: 'user', content: 'Hi' }],
          'claude-3-5-sonnet-20241022',
          { apiKey: 'sk-ant-invalid' }
        )
      ).rejects.toMatchObject({
        statusCode: 401,
        message: expect.stringContaining('Недійсний Anthropic Claude API key'),
      });
    });

    it('maps 429 RateLimitError to localized ChatError 429', async () => {
      mockMessagesCreate.mockRejectedValueOnce(
        new MockRateLimitError('Too many requests')
      );

      await expect(
        claudeService.sendClaudeMessage(
          [{ role: 'user', content: 'Hi' }],
          'claude-3-5-sonnet-20241022',
          { apiKey: 'sk-ant-rate-limited' }
        )
      ).rejects.toMatchObject({
        statusCode: 429,
        message: expect.stringContaining('Перевищено ліміт запитів Anthropic Claude API'),
      });
    });

    it('maps 529 Overloaded error to localized ChatError 529', async () => {
      const err = new MockAPIError(529, 'Overloaded');
      mockMessagesCreate.mockRejectedValueOnce(err);

      await expect(
        claudeService.sendClaudeMessage(
          [{ role: 'user', content: 'Hi' }],
          'claude-3-5-sonnet-20241022',
          { apiKey: 'sk-ant-valid' }
        )
      ).rejects.toMatchObject({
        statusCode: 529,
        message: expect.stringContaining('Сервери Anthropic Claude перевантажені (529 Overloaded)'),
      });
    });

    it('maps other API errors to ChatError with status code or 500', async () => {
      mockMessagesCreate.mockRejectedValueOnce(
        new MockAPIError(500, 'Internal Server Error')
      );

      await expect(
        claudeService.sendClaudeMessage(
          [{ role: 'user', content: 'Hi' }],
          'claude-3-5-sonnet-20241022',
          { apiKey: 'sk-ant-valid' }
        )
      ).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('Помилка Anthropic Claude API'),
      });
    });
  });
});
