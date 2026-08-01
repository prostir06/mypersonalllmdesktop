jest.mock('axios');

import axios from 'axios';
import { EventEmitter } from 'events';
import openaiService = require('../services/openaiService');

const { sendOpenAIMessage, streamOpenAIMessage } = openaiService;
const mockedAxios = axios as unknown as { post: jest.Mock };

function mockSseStream(lines: string[]) {
  mockedAxios.post = jest.fn().mockImplementation(() => {
    const ee = new EventEmitter();
    setImmediate(() => {
      for (const line of lines) {
        ee.emit('data', Buffer.from(line));
      }
      ee.emit('end');
    });
    return Promise.resolve({ data: ee });
  });
}

describe('openaiService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sendOpenAIMessage returns content/usage/model', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Hello' } }],
        usage: { total_tokens: 3 },
        model: 'gpt-3.5-turbo',
      },
    });

    const result = await sendOpenAIMessage(
      [{ role: 'user', content: 'Hi' }],
      'gpt-3.5-turbo',
      { temperature: 0.2, ollama_host: 'http://ignore' }
    );

    expect(result).toEqual({
      content: 'Hello',
      usage: { total_tokens: 3 },
      model: 'gpt-3.5-turbo',
    });
    const [url, payload, config] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(payload.ollama_host).toBeUndefined();
    expect(payload.temperature).toBe(0.2);
    expect(config.headers.Authorization).toBe('Bearer test-key');
  });

  it('sendOpenAIMessage throws generic error on failure', async () => {
    mockedAxios.post = jest.fn().mockRejectedValue({
      response: { data: { error: 'secret' } },
      message: 'network',
    });
    await expect(
      sendOpenAIMessage([{ role: 'user', content: 'x' }])
    ).rejects.toThrow('Failed to communicate with OpenAI API');
  });

  it('streamOpenAIMessage emits tokens and resolves content', async () => {
    mockSseStream([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
      'data: [DONE]\n',
    ]);
    const onChunk = jest.fn();
    const result = await streamOpenAIMessage(
      [{ role: 'user', content: 'Hi' }],
      'gpt-3.5-turbo',
      {},
      onChunk
    );
    expect(onChunk.mock.calls.map((c) => c[0]).join('')).toBe('Hello');
    expect(result.content).toBe('Hello');
    expect(mockedAxios.post.mock.calls[0][1].stream).toBe(true);
    expect(mockedAxios.post.mock.calls[0][2].responseType).toBe('stream');
  });
});
