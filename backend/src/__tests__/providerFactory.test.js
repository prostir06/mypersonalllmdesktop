/**
 * @file providerFactory.test.js
 * Юніт-тести для ProviderFactory та сервісів підключення до провайдерів AI
 * Дотримання стандарту: StandardJS / Jest
 */

const ProviderFactory = require('../services/providerFactory');
const openaiService = require('../services/openaiService');
const ollamaService = require('../services/ollamaService');

jest.mock('../services/openaiService', () => ({
  sendOpenAIMessage: jest.fn().mockResolvedValue({ content: 'OpenAI Test Response', usage: { total_tokens: 10 }, model: 'gpt-3.5-turbo' }),
  streamOpenAIMessage: jest.fn().mockImplementation((messages, model, options, onChunk) => {
    if (onChunk) onChunk('Hello ');
    if (onChunk) onChunk('World');
    return Promise.resolve({ content: 'Hello World', model });
  })
}));

jest.mock('../services/ollamaService', () => ({
  sendOllamaMessage: jest.fn().mockResolvedValue({ content: 'Ollama Test Response', usage: {}, model: 'llama2' }),
  streamOllamaMessage: jest.fn().mockResolvedValue({ content: 'Ollama Stream Response', model: 'llama2' })
}));

describe('ProviderFactory Service Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('повертає правильних провайдерів за назвою', () => {
    const openaiProv = ProviderFactory.getProvider('openai');
    expect(openaiProv.send).toBe(openaiService.sendOpenAIMessage);

    const ollamaProv = ProviderFactory.getProvider('ollama');
    expect(ollamaProv.send).toBe(ollamaService.sendOllamaMessage);

    const defaultProv = ProviderFactory.getProvider('unknown-provider');
    expect(defaultProv.send).toBe(openaiService.sendOpenAIMessage);
  });

  test('успішно надсилає повідомлення через sendMessage', async () => {
    const messages = [{ role: 'user', content: 'Привіт' }];
    const result = await ProviderFactory.sendMessage('openai', messages, 'gpt-3.5-turbo');

    expect(openaiService.sendOpenAIMessage).toHaveBeenCalledWith(messages, 'gpt-3.5-turbo', {});
    expect(result.content).toBe('OpenAI Test Response');
  });

  test('успішно стрімить повідомлення через streamMessage', async () => {
    const messages = [{ role: 'user', content: 'Привіт' }];
    const onChunkMock = jest.fn();

    const result = await ProviderFactory.streamMessage('openai', messages, 'gpt-3.5-turbo', {}, onChunkMock);

    expect(openaiService.streamOpenAIMessage).toHaveBeenCalledWith(messages, 'gpt-3.5-turbo', {}, onChunkMock);
    expect(onChunkMock).toHaveBeenCalledWith('Hello ');
    expect(result.content).toBe('Hello World');
  });

  test('повертає перелік усіх підтримуваних провайдерів', () => {
    const providers = ProviderFactory.getAvailableProviders();
    expect(providers).toContain('openai');
    expect(providers).toContain('ollama');
    expect(providers).toContain('microsoft');
  });
});
