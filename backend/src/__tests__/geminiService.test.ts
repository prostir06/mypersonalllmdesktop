const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();

jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
        generateContentStream: mockGenerateContentStream,
      },
    })),
  };
});

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import geminiService, {
  buildGeminiPayload,
  formatGroundingSources,
} from '../services/geminiService';
import { ChatError } from '../services/chat/types';

describe('geminiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('apiKey validation', () => {
    it('throws ChatError 400 when API key is missing in sendGeminiMessage', async () => {
      await expect(
        geminiService.sendGeminiMessage(
          [{ role: 'user', content: 'Hello' }],
          'gemini-2.0-flash',
          {}
        )
      ).rejects.toThrow('Google Gemini API key не налаштовано');
    });

    it('throws ChatError 400 when API key is blank in streamGeminiMessage', async () => {
      await expect(
        geminiService.streamGeminiMessage(
          [{ role: 'user', content: 'Hello' }],
          'gemini-2.0-flash',
          { apiKey: '   ' }
        )
      ).rejects.toThrow('Google Gemini API key не налаштовано');
    });
  });

  describe('formatGroundingSources', () => {
    it('transforms messages correctly and formats grounding metadata into RagSource', () => {
      const rawChunks = [
        {
          web: {
            uri: 'https://example.com/article',
            title: 'Example Article',
          },
        },
      ];
      const sources = formatGroundingSources(rawChunks);
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        id: 'web-0',
        document_id: 0,
        filename: 'Example Article',
        chunk_index: 0,
        snippet: 'Example Article',
        url: 'https://example.com/article',
        score: 1.0,
        source_type: 'web_search',
      });
    });

    it('falls back to URL hostname when title is missing', () => {
      const rawChunks = [
        {
          web: {
            uri: 'https://sub.news.org/page/123',
          },
        },
      ];
      const sources = formatGroundingSources(rawChunks);
      expect(sources).toHaveLength(1);
      expect(sources[0].filename).toBe('sub.news.org');
    });

    it('handles non-array or empty inputs safely', () => {
      expect(formatGroundingSources(undefined)).toEqual([]);
      expect(formatGroundingSources([])).toEqual([]);
      expect(formatGroundingSources([{} as any])).toEqual([]);
    });
  });

  describe('buildGeminiPayload', () => {
    it('extracts system instructions and builds user/model contents', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const { contents, config } = buildGeminiPayload(messages, {
        temperature: 0.5,
        max_tokens: 1500,
      });

      expect(config.systemInstruction).toEqual({
        parts: [{ text: 'You are a helpful assistant.' }],
      });
      expect(config.temperature).toBe(0.5);
      expect(config.maxOutputTokens).toBe(1500);

      expect(contents).toHaveLength(2);
      expect(contents[0]).toEqual({
        role: 'user',
        parts: [{ text: 'Hello!' }],
      });
      expect(contents[1]).toEqual({
        role: 'model',
        parts: [{ text: 'Hi there!' }],
      });
    });

    it('processes multimodal image parts', () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
              },
            },
          ],
        },
      ];

      const { contents } = buildGeminiPayload(messages);
      expect(contents).toHaveLength(1);
      expect(contents[0].parts).toEqual([
        { text: 'What is in this image?' },
        {
          inlineData: {
            mimeType: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAA',
          },
        },
      ]);
    });

    it('configures googleSearch tool when enableWebSearch is true', () => {
      const { config } = buildGeminiPayload(
        [{ role: 'user', content: 'Search this' }],
        { enableWebSearch: true }
      );

      expect(config.tools).toEqual([{ googleSearch: {} }]);
    });
  });

  describe('sendGeminiMessage', () => {
    it('generates content and returns text with grounding sources', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Paris is the capital of France.',
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    uri: 'https://en.wikipedia.org/wiki/Paris',
                    title: 'Paris - Wikipedia',
                  },
                },
              ],
            },
          },
        ],
      });

      const result = await geminiService.sendGeminiMessage(
        [{ role: 'user', content: 'Capital of France?' }],
        'gemini-2.0-flash',
        { apiKey: 'test-key', enableWebSearch: true }
      );

      expect(result.content).toBe('Paris is the capital of France.');
      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].url).toBe('https://en.wikipedia.org/wiki/Paris');
    });

    it('maps 429 RESOURCE_EXHAUSTED errors to ChatError 429', async () => {
      mockGenerateContent.mockRejectedValueOnce({
        status: 429,
        message: 'RESOURCE_EXHAUSTED quota exceeded',
      });

      await expect(
        geminiService.sendGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' }
        )
      ).rejects.toMatchObject({
        statusCode: 429,
        message: expect.stringContaining('Перевищено ліміт запитів Gemini API'),
      });
    });

    it('maps unexpected errors to ChatError 500', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Internal network error'));

      await expect(
        geminiService.sendGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' }
        )
      ).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('Помилка Gemini API: Internal network error'),
      });
    });
  });

  describe('streamGeminiMessage', () => {
    it('streams chunks via onChunk and collects final grounding sources', async () => {
      const asyncChunks = [
        { text: 'Hello ' },
        { text: 'world!' },
        {
          text: '',
          candidates: [
            {
              groundingMetadata: {
                groundingChunks: [
                  {
                    web: {
                      uri: 'https://google.com',
                      title: 'Google',
                    },
                  },
                ],
              },
            },
          ],
        },
      ];

      mockGenerateContentStream.mockResolvedValueOnce({
        async *[Symbol.asyncIterator]() {
          for (const chunk of asyncChunks) {
            yield chunk;
          }
        },
      });

      const onChunk = jest.fn();
      const result = await geminiService.streamGeminiMessage(
        [{ role: 'user', content: 'Hello' }],
        'gemini-2.0-flash',
        { apiKey: 'test-key' },
        onChunk
      );

      expect(onChunk).toHaveBeenCalledWith('Hello ');
      expect(onChunk).toHaveBeenCalledWith('world!');
      expect(result.content).toBe('Hello world!');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].url).toBe('https://google.com');
    });

    it('maps 429 errors during stream to ChatError 429', async () => {
      mockGenerateContentStream.mockRejectedValueOnce({
        message: 'RESOURCE_EXHAUSTED: rate limit exceeded',
      });

      await expect(
        geminiService.streamGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' }
        )
      ).rejects.toMatchObject({
        statusCode: 429,
      });
    });

    it('maps stream errors to ChatError 500', async () => {
      mockGenerateContentStream.mockRejectedValueOnce(new Error('Stream broke'));

      await expect(
        geminiService.streamGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' }
        )
      ).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('Помилка стрімінгу Gemini: Stream broke'),
      });
    });
  });
});
