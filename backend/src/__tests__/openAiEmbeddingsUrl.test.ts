import { openAiEmbeddingsUrl } from '../services/embeddings/OpenAiEmbeddingProvider';

describe('openAiEmbeddingsUrl', () => {
  const previous = process.env.OPENAI_BASE_URL;

  afterEach(() => {
    if (previous === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previous;
  });

  it('defaults to the public embeddings API', () => {
    delete process.env.OPENAI_BASE_URL;
    expect(openAiEmbeddingsUrl()).toBe('https://api.openai.com/v1/embeddings');
  });

  it('follows OPENAI_BASE_URL and strips a trailing slash', () => {
    process.env.OPENAI_BASE_URL = 'http://mock-llm:4010/v1/';
    expect(openAiEmbeddingsUrl()).toBe('http://mock-llm:4010/v1/embeddings');
  });
});
