jest.mock('axios');
jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

import axios from 'axios';
import { EventEmitter } from 'events';
import ollamaService from '../services/ollamaService';
import logger from '../logger';

const { sendOllamaMessage, streamOllamaMessage } = ollamaService;
const mockedAxios = axios as unknown as { post: jest.Mock };

describe('ollamaService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sendOllamaMessage uses ollama_host when provided', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Local' } }],
        usage: {},
        model: 'llama2',
      },
    });

    const result = await sendOllamaMessage(
      [{ role: 'user', content: 'Hi' }],
      'llama2',
      { ollama_host: 'http://127.0.0.1:11434/v1/chat/completions' }
    );

    expect(result.content).toBe('Local');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'http://127.0.0.1:11434/v1/chat/completions'
    );
    expect(mockedAxios.post.mock.calls[0][1].ollama_host).toBeUndefined();
  });

  it('sendOllamaMessage throws generic error on failure', async () => {
    mockedAxios.post = jest.fn().mockRejectedValue(new Error('down'));
    await expect(
      sendOllamaMessage([{ role: 'user', content: 'x' }])
    ).rejects.toThrow('Failed to communicate with Ollama API');
  });

  it('sendOllamaMessage rejects disallowed ollama_host', async () => {
    mockedAxios.post = jest.fn();
    await expect(
      sendOllamaMessage([{ role: 'user', content: 'Hi' }], 'llama2', {
        ollama_host: 'http://169.254.169.254/',
      })
    ).rejects.toThrow(/not allowed/i);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('sendOllamaMessage disables axios redirects', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: {
        choices: [{ message: { content: 'ok' } }],
        usage: {},
        model: 'llama2',
      },
    });
    await sendOllamaMessage([{ role: 'user', content: 'Hi' }], 'llama2', {
      ollama_host: 'http://127.0.0.1:11434/v1/chat/completions',
    });
    expect(mockedAxios.post.mock.calls[0][2]).toMatchObject({
      maxRedirects: 0,
    });
  });

  it('streamOllamaMessage disables axios redirects', async () => {
    mockedAxios.post = jest.fn().mockImplementation(() => {
      const ee = new EventEmitter();
      setImmediate(() => ee.emit('end'));
      return Promise.resolve({ data: ee });
    });
    await streamOllamaMessage([{ role: 'user', content: 'Hi' }], 'llama2');
    expect(mockedAxios.post.mock.calls[0][2]).toMatchObject({
      maxRedirects: 0,
    });
  });

  it('sendOllamaMessage ignores client overrides of model/messages/stream', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: {
        choices: [{ message: { content: 'ok' } }],
        usage: {},
        model: 'llama2',
      },
    });

    const messages = [{ role: 'user', content: 'Hi' }];
    await sendOllamaMessage(messages, 'llama2', {
      model: 'evil',
      messages: [],
      stream: true,
      temperature: 0.2,
      max_tokens: 100,
      top_p: 0.9,
      hack: 'nope',
    } as any);

    const payload = mockedAxios.post.mock.calls[0][1];
    expect(payload.model).toBe('llama2');
    expect(payload.messages).toBe(messages);
    expect(payload.stream).toBeUndefined();
    expect(payload.temperature).toBe(0.2);
    expect(payload.max_tokens).toBe(100);
    expect(payload.top_p).toBe(0.9);
    expect(payload.hack).toBeUndefined();
  });

  it('streamOllamaMessage keeps stream:true and service model/messages', async () => {
    mockedAxios.post = jest.fn().mockImplementation(() => {
      const ee = new EventEmitter();
      setImmediate(() => ee.emit('end'));
      return Promise.resolve({ data: ee });
    });

    const messages = [{ role: 'user', content: 'Hi' }];
    await streamOllamaMessage(messages, 'llama2', {
      model: 'evil',
      messages: [{ role: 'system', content: 'pwn' }],
      stream: false,
      temperature: 0.5,
    } as any);

    const payload = mockedAxios.post.mock.calls[0][1];
    expect(payload.model).toBe('llama2');
    expect(payload.messages).toBe(messages);
    expect(payload.stream).toBe(true);
    expect(payload.temperature).toBe(0.5);
  });

  it('streamOllamaMessage forwards AbortSignal to axios', async () => {
    mockedAxios.post = jest.fn().mockImplementation(() => {
      const ee = new EventEmitter();
      setImmediate(() => ee.emit('end'));
      return Promise.resolve({ data: ee });
    });
    const ac = new AbortController();
    await streamOllamaMessage([{ role: 'user', content: 'Hi' }], 'llama2', {
      signal: ac.signal,
    } as any);
    expect(mockedAxios.post.mock.calls[0][2].signal).toBe(ac.signal);
  });

  it('streamOllamaMessage emits tokens', async () => {
    mockedAxios.post = jest.fn().mockImplementation(() => {
      const ee = new EventEmitter();
      setImmediate(() => {
        ee.emit(
          'data',
          Buffer.from('data: {"choices":[{"delta":{"content":"A"}}]}\n')
        );
        ee.emit('end');
      });
      return Promise.resolve({ data: ee });
    });
    const onChunk = jest.fn();
    const result = await streamOllamaMessage(
      [{ role: 'user', content: 'Hi' }],
      'llama2',
      {},
      onChunk
    );
    expect(onChunk).toHaveBeenCalledWith('A');
    expect(result.content).toBe('A');
  });

  it('streamOllamaMessage rejects when onChunk throws non-abort', async () => {
    mockedAxios.post = jest.fn().mockImplementation(() => {
      const ee = new EventEmitter();
      setImmediate(() => {
        ee.emit(
          'data',
          Buffer.from('data: {"choices":[{"delta":{"content":"A"}}]}\n')
        );
      });
      return Promise.resolve({ data: ee });
    });
    const onChunk = jest.fn().mockImplementation(() => {
      throw new Error('UI crash');
    });
    await expect(
      streamOllamaMessage([{ role: 'user', content: 'Hi' }], 'llama2', {}, onChunk)
    ).rejects.toThrow('UI crash');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('onChunk')
    );
  });

  it('sendOllamaMessage captures prompt_eval_count and eval_count as tokenUsage', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Local response' } }],
        done: true,
        prompt_eval_count: 50,
        eval_count: 120,
        model: 'llama3:latest',
      },
    });

    const result = await sendOllamaMessage(
      [{ role: 'user', content: 'Hi' }],
      'llama3:latest'
    );

    expect(result.content).toBe('Local response');
    expect(result.tokenUsage).toEqual({
      promptTokens: 50,
      completionTokens: 120,
      totalTokens: 170,
      estimatedCostUsd: 0,
    });
  });

  it('streamOllamaMessage captures tokenUsage when done: true chunk arrives', async () => {
    mockedAxios.post = jest.fn().mockImplementation(() => {
      const ee = new EventEmitter();
      setImmediate(() => {
        ee.emit(
          'data',
          Buffer.from('data: {"choices":[{"delta":{"content":"Hi"}}]}\n')
        );
        ee.emit(
          'data',
          Buffer.from('data: {"done":true,"prompt_eval_count":25,"eval_count":45}\n')
        );
        ee.emit('end');
      });
      return Promise.resolve({ data: ee });
    });

    const result = await streamOllamaMessage(
      [{ role: 'user', content: 'Hi' }],
      'llama3:latest'
    );

    expect(result.content).toBe('Hi');
    expect(result.tokenUsage).toEqual({
      promptTokens: 25,
      completionTokens: 45,
      totalTokens: 70,
      estimatedCostUsd: 0,
    });
  });
});
