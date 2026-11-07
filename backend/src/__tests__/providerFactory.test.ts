jest.mock('../services/openaiService', () => ({
  __esModule: true,
  default: {
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
  },
}));

jest.mock('../services/ollamaService', () => ({
  __esModule: true,
  default: {
    sendOllamaMessage: jest
      .fn()
      .mockResolvedValue({ content: 'Ollama Test Response', usage: {}, model: 'llama2' }),
    streamOllamaMessage: jest
      .fn()
      .mockResolvedValue({ content: 'Ollama Stream Response', model: 'llama2' }),
  },
}));

jest.mock('../services/geminiService', () => ({
  __esModule: true,
  default: {
    sendGeminiMessage: jest
      .fn()
      .mockResolvedValue({ content: 'Gemini Test Response', model: 'gemini-2.0-flash' }),
    streamGeminiMessage: jest
      .fn()
      .mockResolvedValue({ content: 'Gemini Stream Response', model: 'gemini-2.0-flash' }),
  },
}));

jest.mock('../services/claudeService', () => ({
  __esModule: true,
  default: {
    sendClaudeMessage: jest
      .fn()
      .mockResolvedValue({ content: 'Claude Test Response', model: 'claude-3-5-sonnet-20241022' }),
    streamClaudeMessage: jest
      .fn()
      .mockResolvedValue({ content: 'Claude Stream Response', model: 'claude-3-5-sonnet-20241022' }),
  },
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import ProviderFactory from '../services/providerFactory';
import openaiService from '../services/openaiService';
import geminiService from '../services/geminiService';
import claudeService from '../services/claudeService';
import { ChatError } from '../services/chat/types';

describe('ProviderFactory', () => {
  afterEach(() => jest.clearAllMocks());

  it('resolves an adapter and passes abort as its own argument', async () => {
    const messages = [{ role: 'user', content: 'Привіт' }];
    const signal = new AbortController().signal;
    await ProviderFactory.getProvider('openai').send(
      messages,
      { model: 'gpt-4o-mini', temperature: 0.2 },
      signal
    );
    expect(openaiService.sendOpenAIMessage).toHaveBeenCalledWith(messages, 'gpt-4o-mini', {
      temperature: 0.2,
      signal,
    });
    expect(ProviderFactory.getProvider('OPENAI').capabilities('gpt-4o')).toMatchObject({
      tools: true,
      vision: true,
    });
    expect(ProviderFactory.getProvider('ollama').capabilities('llama2').tools).toBe(false);
    expect(typeof ProviderFactory.getProvider('gemini').stream).toBe('function');
    expect(typeof ProviderFactory.getProvider('anthropic').send).toBe('function');
  });

  it('throws ChatError 400 for unknown providers', () => {
    expect(() => ProviderFactory.getProvider('unknown-xyz')).toThrow(ChatError);
    try {
      ProviderFactory.getProvider('unknown-xyz');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ChatError);
      expect((err as ChatError).statusCode).toBe(400);
      expect((err as ChatError).message).toBe('Unsupported LLM provider: "unknown-xyz"');
    }
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

  it('sendMessage wires to gemini', async () => {
    const messages = [{ role: 'user', content: 'Привіт' }];
    const result = await ProviderFactory.sendMessage(
      'gemini',
      messages,
      'gemini-2.0-flash'
    );
    expect(geminiService.sendGeminiMessage).toHaveBeenCalledWith(
      messages,
      'gemini-2.0-flash',
      {}
    );
    expect(result.content).toBe('Gemini Test Response');
  });

  it('sendMessage wires to anthropic', async () => {
    const messages = [{ role: 'user', content: 'Привіт' }];
    const result = await ProviderFactory.sendMessage(
      'anthropic',
      messages,
      'claude-3-5-sonnet-20241022'
    );
    expect(claudeService.sendClaudeMessage).toHaveBeenCalledWith(
      messages,
      'claude-3-5-sonnet-20241022',
      {}
    );
    expect(result.content).toBe('Claude Test Response');
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

  it('streamMessage wires to gemini', async () => {
    const onChunkMock = jest.fn();
    const result = await ProviderFactory.streamMessage(
      'gemini',
      [{ role: 'user', content: 'Привіт' }],
      'gemini-2.0-flash',
      {},
      onChunkMock
    );
    expect(geminiService.streamGeminiMessage).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Привіт' }],
      'gemini-2.0-flash',
      {},
      onChunkMock
    );
    expect(result.content).toBe('Gemini Stream Response');
  });

  it('streamMessage wires to anthropic', async () => {
    const onChunkMock = jest.fn();
    const result = await ProviderFactory.streamMessage(
      'anthropic',
      [{ role: 'user', content: 'Привіт' }],
      'claude-3-5-sonnet-20241022',
      {},
      onChunkMock
    );
    expect(claudeService.streamClaudeMessage).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Привіт' }],
      'claude-3-5-sonnet-20241022',
      {},
      onChunkMock
    );
    expect(result.content).toBe('Claude Stream Response');
  });

  it('lists only honest available providers', () => {
    const providers = ProviderFactory.getAvailableProviders();
    expect(providers).toEqual(['openai', 'ollama', 'gemini', 'anthropic']);
  });
});
