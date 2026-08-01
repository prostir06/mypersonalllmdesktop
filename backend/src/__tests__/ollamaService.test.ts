jest.mock('axios');

import axios from 'axios';
import { EventEmitter } from 'events';
import ollamaService = require('../services/ollamaService');

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
});
