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

    it('formats tool calls and results as function parts and skips googleSearch', () => {
      const { contents, config } = buildGeminiPayload(
        [
          { role: 'user', content: 'Яка погода?' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call-1',
                function: { name: 'get_weather', arguments: '{"city":"Kyiv"}' },
              },
              {
                id: 'call-2',
                function: { name: 'get_weather', arguments: '{"city":"Lviv"}' },
              },
            ],
          },
          { role: 'tool', tool_call_id: 'call-1', content: '{"temp":12}' },
          { role: 'tool', tool_call_id: 'call-2', content: 'ясно' },
        ] as any,
        {
          enableWebSearch: true,
          tools: [{ name: 'get_weather', description: 'Погода', parameters: { type: 'object' } }],
        }
      );

      expect(config.tools).toEqual([
        {
          functionDeclarations: [
            { name: 'get_weather', description: 'Погода', parameters: { type: 'object' } },
          ],
        },
      ]);
      expect(contents[1]).toEqual({
        role: 'model',
        parts: [
          { functionCall: { id: 'call-1', name: 'get_weather', args: { city: 'Kyiv' } } },
          { functionCall: { id: 'call-2', name: 'get_weather', args: { city: 'Lviv' } } },
        ],
      });
      expect(contents[2]).toEqual({
        role: 'user',
        parts: [
          { functionResponse: { id: 'call-1', name: 'get_weather', response: { temp: 12 } } },
          { functionResponse: { id: 'call-2', name: 'get_weather', response: { result: 'ясно' } } },
        ],
      });
      expect(contents[1].parts[0]).not.toEqual(contents[1].parts[1]);
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

    it('captures usageMetadata and maps to tokenUsage with estimated cost', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: 'Hello!',
        usageMetadata: {
          promptTokenCount: 1000,
          candidatesTokenCount: 500,
          totalTokenCount: 1500,
        },
      });

      const result = await geminiService.sendGeminiMessage(
        [{ role: 'user', content: 'Hi' }],
        'gemini-2.0-flash',
        { apiKey: 'test-key' }
      );

      expect(result.tokenUsage).toEqual({
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        estimatedCostUsd: 0.0003,
      });
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

    it('keeps the provider function-call id and does not reuse the function name', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: '',
        candidates: [
          {
            content: {
              parts: [
                { functionCall: { id: 'fc-a', name: 'search_documents', args: { q: 'a' } } },
                { functionCall: { name: 'search_documents', args: { q: 'b' } } },
              ],
            },
          },
        ],
      });

      const result = await geminiService.sendGeminiMessage(
        [{ role: 'user', content: 'Знайди' }],
        'gemini-2.0-flash',
        { apiKey: 'test-key' }
      );

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls?.[0].id).toBe('fc-a');
      expect(result.toolCalls?.[1].id).not.toBe('search_documents');
      expect(result.toolCalls?.[1].id).not.toBe(result.toolCalls?.[0].id);
    });

    it('maps a Gemini HTTP 400 to ChatError 400', async () => {
      mockGenerateContent.mockRejectedValueOnce({
        status: 400,
        message: 'Invalid argument: tools',
      });

      await expect(
        geminiService.sendGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' }
        )
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Некоректний запит до Gemini'),
      });
    });

    it('maps invalid API key errors to ChatError 401', async () => {
      mockGenerateContent.mockRejectedValueOnce({
        status: 403,
        message: 'PERMISSION_DENIED: API key not valid. Please pass a valid API key.',
      });

      await expect(
        geminiService.sendGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' }
        )
      ).rejects.toMatchObject({
        statusCode: 401,
        message: expect.stringContaining('Недійсний Google Gemini API key'),
      });
    });

    it('re-throws abort errors without wrapping into ChatError 500', async () => {
      const abortError = Object.assign(new Error('Aborted'), { code: 'ERR_CANCELED' });
      mockGenerateContent.mockRejectedValueOnce(abortError);

      await expect(
        geminiService.sendGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' }
        )
      ).rejects.toThrow('Aborted');
    });

    it('returns safety fallback message when finishReason is SAFETY in sendGeminiMessage', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: '',
        candidates: [{ finishReason: 'SAFETY' }],
      });

      const result = await geminiService.sendGeminiMessage(
        [{ role: 'user', content: 'Dangerous prompt' }],
        'gemini-2.0-flash',
        { apiKey: 'test-key' }
      );

      expect(result.content).toBe('Відповідь заблоковано фільтрами безпеки Google Gemini.');
    });

    it('aborts immediately in sendGeminiMessage when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        geminiService.sendGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key', signal: controller.signal }
        )
      ).rejects.toMatchObject({
        name: 'AbortError',
        message: 'Generation stopped by user',
      });
      expect(mockGenerateContent).not.toHaveBeenCalled();
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

    it('captures usageMetadata from stream chunks and maps to tokenUsage', async () => {
      const asyncChunks = [
        { text: 'Hi ' },
        {
          text: 'there!',
          usageMetadata: {
            promptTokenCount: 2000,
            candidatesTokenCount: 1000,
            totalTokenCount: 3000,
          },
        },
      ];
      mockGenerateContentStream.mockResolvedValueOnce({
        async *[Symbol.asyncIterator]() {
          for (const chunk of asyncChunks) yield chunk;
        },
      });

      const result = await geminiService.streamGeminiMessage(
        [{ role: 'user', content: 'Hi' }],
        'gemini-2.0-flash',
        { apiKey: 'test-key' }
      );

      expect(result.content).toBe('Hi there!');
      expect(result.tokenUsage).toEqual({
        promptTokens: 2000,
        completionTokens: 1000,
        totalTokens: 3000,
        estimatedCostUsd: 0.0006,
      });
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

    it('maps invalid API key errors to ChatError 401', async () => {
      mockGenerateContentStream.mockRejectedValueOnce({
        status: 400,
        message: 'API_KEY_INVALID: API key not valid. Please pass a valid API key.',
      });

      await expect(
        geminiService.streamGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' }
        )
      ).rejects.toMatchObject({
        statusCode: 401,
        message: expect.stringContaining('Недійсний Google Gemini API key'),
      });
    });

    it('re-throws abort errors without wrapping into ChatError 500', async () => {
      const abortError = Object.assign(new Error('This operation was aborted'), {
        name: 'AbortError',
      });
      mockGenerateContentStream.mockRejectedValueOnce(abortError);

      await expect(
        geminiService.streamGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' }
        )
      ).rejects.toThrow('This operation was aborted');
    });

    it('aborts the stream when onChunk throws and rethrows AbortError', async () => {
      const asyncChunks = [{ text: 'Chunk 1' }, { text: 'Chunk 2' }];
      mockGenerateContentStream.mockResolvedValueOnce({
        async *[Symbol.asyncIterator]() {
          for (const chunk of asyncChunks) yield chunk;
        },
      });

      const onChunkError = jest.fn().mockImplementationOnce(() => {
        throw new Error('Callback UI glitch');
      });

      await expect(
        geminiService.streamGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' },
          onChunkError
        )
      ).rejects.toMatchObject({
        name: 'StreamCallbackError',
        message: 'Callback UI glitch',
      });

      // AbortError in onChunk is rethrown
      mockGenerateContentStream.mockResolvedValueOnce({
        async *[Symbol.asyncIterator]() {
          for (const chunk of asyncChunks) yield chunk;
        },
      });
      const onChunkAbort = jest.fn().mockImplementationOnce(() => {
        throw Object.assign(new Error('User clicked Stop'), { name: 'AbortError' });
      });

      await expect(
        geminiService.streamGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key' },
          onChunkAbort
        )
      ).rejects.toThrow('User clicked Stop');
    });

    it('aborts during streaming iteration when signal.aborted becomes true', async () => {
      const controller = new AbortController();
      const asyncChunks = [
        { text: 'Chunk 1' },
        { text: 'Chunk 2' },
      ];

      mockGenerateContentStream.mockResolvedValueOnce({
        async *[Symbol.asyncIterator]() {
          for (const chunk of asyncChunks) {
            yield chunk;
          }
        },
      });

      const onChunk = jest.fn().mockImplementation(() => {
        controller.abort();
      });

      await expect(
        geminiService.streamGeminiMessage(
          [{ role: 'user', content: 'Hi' }],
          'gemini-2.0-flash',
          { apiKey: 'test-key', signal: controller.signal },
          onChunk
        )
      ).rejects.toMatchObject({
        name: 'AbortError',
        message: 'Generation stopped by user',
      });
    });

    it('returns safety fallback message when candidate finishReason is SAFETY in stream', async () => {
      mockGenerateContentStream.mockResolvedValueOnce({
        async *[Symbol.asyncIterator]() {
          yield {
            text: '',
            candidates: [{ finishReason: 'SAFETY' }],
          };
        },
      });

      const onChunk = jest.fn();
      const result = await geminiService.streamGeminiMessage(
        [{ role: 'user', content: 'Dangerous prompt' }],
        'gemini-2.0-flash',
        { apiKey: 'test-key' },
        onChunk
      );

      expect(result.content).toBe('Відповідь заблоковано фільтрами безпеки Google Gemini.');
      expect(onChunk).toHaveBeenCalledWith('Відповідь заблоковано фільтрами безпеки Google Gemini.');
    });
  });
});
