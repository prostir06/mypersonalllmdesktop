jest.mock('../services/openaiService', () => ({
  sendOpenAIMessage: jest.fn().mockResolvedValue({
    content: 'OpenAI Test Response',
    usage: { total_tokens: 10 },
    model: 'gpt-3.5-turbo',
  }),
  streamOpenAIMessage: jest
    .fn()
    .mockImplementation(
      (
        _messages: unknown,
        model: string,
        _options: unknown,
        onChunk?: (t: string) => void
      ) => {
        if (onChunk) onChunk('Hello ');
        if (onChunk) onChunk('World');
        return Promise.resolve({ content: 'Hello World', model });
      }
    ),
}));

jest.mock('../services/ollamaService', () => ({
  sendOllamaMessage: jest
    .fn()
    .mockResolvedValue({ content: 'Ollama Test Response', usage: {}, model: 'llama2' }),
  streamOllamaMessage: jest
    .fn()
    .mockResolvedValue({ content: 'Ollama Stream Response', model: 'llama2' }),
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import ProviderFactory = require('../services/providerFactory');
import openaiService = require('../services/openaiService');
import ollamaService = require('../services/ollamaService');

describe('ProviderFactory', () => {
  afterEach(() => jest.clearAllMocks());

  it('resolves providers by name and falls back to openai', () => {
    expect(ProviderFactory.getProvider('openai').send).toBe(
      openaiService.sendOpenAIMessage
    );
    expect(ProviderFactory.getProvider('ollama').send).toBe(
      ollamaService.sendOllamaMessage
    );
    expect(ProviderFactory.getProvider('unknown-provider').send).toBe(
      openaiService.sendOpenAIMessage
    );
    expect(ProviderFactory.getProvider('ChatGPT').send).toBe(
      openaiService.sendOpenAIMessage
    );
  });

  it('sendMessage wires to openai', async () => {
    const messages = [{ role: 'user', content: 'Привіт' }];
    const result = await ProviderFactory.sendMessage(
      'openai',
      messages,
      'gpt-3.5-turbo'
    );
    expect(openaiService.sendOpenAIMessage).toHaveBeenCalledWith(
      messages,
      'gpt-3.5-turbo',
      {}
    );
    expect(result.content).toBe('OpenAI Test Response');
  });

  it('streamMessage wires onChunk', async () => {
    const onChunkMock = jest.fn();
    const result = await ProviderFactory.streamMessage(
      'openai',
      [{ role: 'user', content: 'Привіт' }],
      'gpt-3.5-turbo',
      {},
      onChunkMock
    );
    expect(openaiService.streamOpenAIMessage).toHaveBeenCalled();
    expect(onChunkMock).toHaveBeenCalledWith('Hello ');
    expect(result.content).toBe('Hello World');
  });

  it('lists available providers', () => {
    const providers = ProviderFactory.getAvailableProviders();
    expect(providers).toContain('openai');
    expect(providers).toContain('ollama');
    expect(providers).toContain('microsoft');
  });
});
