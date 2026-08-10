jest.mock('axios');
jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import axios from 'axios';
import { resolveOllamaEmbeddingsUrl } from '../utils/ollamaEmbeddingsUrl';
import { OllamaEmbeddingProvider } from '../services/embeddings/OllamaEmbeddingProvider';
import { UrlNotAllowedError } from '../utils/urlAllowlist';

const mockedAxios = axios as unknown as { post: jest.Mock };

describe('ollamaEmbeddingsUrl', () => {
  it('derives embeddings URL from chat completions host', () => {
    expect(
      resolveOllamaEmbeddingsUrl(
        'http://127.0.0.1:11434/v1/chat/completions'
      )
    ).toBe('http://127.0.0.1:11434/api/embeddings');
  });

  it('rejects disallowed hosts', () => {
    expect(() =>
      resolveOllamaEmbeddingsUrl('http://169.254.169.254/v1/chat/completions')
    ).toThrow(UrlNotAllowedError);
  });
});

describe('OllamaEmbeddingProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns embedding vector on success', async () => {
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: { embedding: [0.1, 0.2, 0.3] },
    });
    const result = await OllamaEmbeddingProvider.generateEmbedding(
      'hello',
      'http://127.0.0.1:11434/v1/chat/completions'
    );
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'http://127.0.0.1:11434/api/embeddings'
    );
    expect(mockedAxios.post.mock.calls[0][1].model).toBe('nomic-embed-text');
  });

  it('returns null on failure', async () => {
    mockedAxios.post = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(
      OllamaEmbeddingProvider.generateEmbedding(
        'x',
        'http://127.0.0.1:11434/v1/chat/completions'
      )
    ).resolves.toBeNull();
  });

  it('rethrows UrlNotAllowedError instead of returning null', async () => {
    await expect(
      OllamaEmbeddingProvider.generateEmbedding(
        'x',
        'http://169.254.169.254/v1/chat/completions'
      )
    ).rejects.toThrow(UrlNotAllowedError);
  });
});
