import {
  modelSupportsVision,
  modelSupportsTools,
  getModelCapabilities,
  registerRuntimeModelCapabilities,
  clearRuntimeModelCapabilitiesCache,
} from '../utils/modelCapabilities';

describe('modelCapabilities', () => {
  beforeEach(() => {
    clearRuntimeModelCapabilitiesCache();
  });

  describe('modelSupportsVision', () => {
    it('returns true for explicit vision catalog ids', () => {
      expect(modelSupportsVision('gpt-4o')).toBe(true);
      expect(modelSupportsVision('GPT-4O-MINI')).toBe(true);
      expect(modelSupportsVision('gpt-4-turbo')).toBe(true);
    });

    it('returns false for non-vision and substring lookalikes', () => {
      expect(modelSupportsVision('gpt-4')).toBe(false);
      expect(modelSupportsVision('gpt-3.5-turbo')).toBe(false);
      expect(modelSupportsVision('llama3')).toBe(false);
      expect(modelSupportsVision('')).toBe(false);
      expect(modelSupportsVision(null)).toBe(false);
    });

    it('recognizes gemini models as supporting vision', () => {
      expect(modelSupportsVision('gemini-2.0-flash')).toBe(true);
      expect(modelSupportsVision('gemini-1.5-flash')).toBe(true);
      expect(modelSupportsVision('gemini-1.5-pro')).toBe(true);
    });

    it('recognizes claude models as supporting vision', () => {
      expect(modelSupportsVision('claude-3-5-sonnet-20241022')).toBe(true);
      expect(modelSupportsVision('claude-3-5-haiku-20241022')).toBe(true);
      expect(modelSupportsVision('claude-3-opus-20240229')).toBe(true);
      expect(modelSupportsVision('Claude-3.5-Sonnet')).toBe(true);
      expect(modelSupportsVision('claude-sonnet-4-20250514')).toBe(true);
      expect(modelSupportsVision('claude-opus-4')).toBe(true);
    });

    it('recognizes modern multimodal vision models in ollama/open-source', () => {
      expect(modelSupportsVision('gemma4:latest')).toBe(true);
      expect(modelSupportsVision('gemma3:12b')).toBe(true);
      expect(modelSupportsVision('qwen3-vl:latest')).toBe(true);
      expect(modelSupportsVision('qwen2.5vl:latest')).toBe(true);
      expect(modelSupportsVision('minicpm-v4.5:latest')).toBe(true);
      expect(modelSupportsVision('llava:latest')).toBe(true);
      expect(modelSupportsVision('pixtral:12b')).toBe(true);
    });
  });

  describe('modelSupportsTools', () => {
    it('recognizes OpenAI tool-capable models', () => {
      expect(modelSupportsTools('gpt-3.5-turbo')).toBe(true);
      expect(modelSupportsTools('gpt-4')).toBe(true);
      expect(modelSupportsTools('gpt-4o')).toBe(true);
      expect(modelSupportsTools('gpt-4-turbo')).toBe(true);
      expect(modelSupportsTools('o3-mini')).toBe(true);
      expect(modelSupportsTools('o4-mini')).toBe(true);
    });

    it('recognizes Gemini tool-capable models', () => {
      expect(modelSupportsTools('gemini-2.0-flash')).toBe(true);
      expect(modelSupportsTools('gemini-1.5-pro')).toBe(true);
    });

    it('recognizes Anthropic tool-capable models', () => {
      expect(modelSupportsTools('claude-3-5-sonnet-20241022')).toBe(true);
      expect(modelSupportsTools('claude-sonnet-4-20250514')).toBe(true);
      expect(modelSupportsTools('claude-opus-4')).toBe(true);
    });

    it('recognizes Ollama tool-capable models', () => {
      expect(modelSupportsTools('gemma4:latest')).toBe(true);
      expect(modelSupportsTools('qwen2.5:7b')).toBe(true);
      expect(modelSupportsTools('qwen3:latest')).toBe(true);
      expect(modelSupportsTools('llama3.1:8b')).toBe(true);
      expect(modelSupportsTools('llama3.2:3b')).toBe(true);
      expect(modelSupportsTools('llama3.3:70b')).toBe(true);
      expect(modelSupportsTools('mistral:7b')).toBe(true);
      expect(modelSupportsTools('minicpm-v4.5:latest')).toBe(true);
      expect(modelSupportsTools('command-r:latest')).toBe(true);
    });

    it('returns false for non-tool models', () => {
      expect(modelSupportsTools('llama2')).toBe(false);
      expect(modelSupportsTools('llama3')).toBe(false);
      expect(modelSupportsTools('gemma2:9b')).toBe(false);
      expect(modelSupportsTools('llava:latest')).toBe(false);
      expect(modelSupportsTools('')).toBe(false);
      expect(modelSupportsTools(null)).toBe(false);
    });
  });

  describe('getModelCapabilities', () => {
    it('returns empty flags for null or empty input', () => {
      expect(getModelCapabilities(null)).toEqual({
        vision: false,
        tools: false,
        webSearchGrounding: false,
      });
      expect(getModelCapabilities('')).toEqual({
        vision: false,
        tools: false,
        webSearchGrounding: false,
      });
    });

    it('detects webSearchGrounding for Gemini models and provider', () => {
      const caps = getModelCapabilities('gemini-2.0-flash', 'gemini');
      expect(caps).toEqual({
        vision: true,
        tools: true,
        webSearchGrounding: true,
      });
    });

    it('returns accurate full capability matrix for gemma4:latest', () => {
      const caps = getModelCapabilities('gemma4:latest', 'ollama');
      expect(caps).toEqual({
        vision: true,
        tools: true,
        webSearchGrounding: false,
      });
    });
  });

  describe('runtime capability registration & cache', () => {
    it('registers capabilities dynamically for Ollama models', () => {
      expect(modelSupportsVision('custom-model:latest')).toBe(false);
      expect(modelSupportsTools('custom-model:latest')).toBe(false);

      registerRuntimeModelCapabilities('custom-model:latest', ['vision', 'tools']);

      expect(modelSupportsVision('custom-model:latest')).toBe(true);
      expect(modelSupportsTools('custom-model:latest')).toBe(true);
      expect(getModelCapabilities('custom-model:latest')).toEqual({
        vision: true,
        tools: true,
        webSearchGrounding: false,
      });
    });

    it('clears runtime capabilities cache when requested', () => {
      registerRuntimeModelCapabilities('my-ephemeral-model', ['vision']);
      expect(modelSupportsVision('my-ephemeral-model')).toBe(true);

      clearRuntimeModelCapabilitiesCache();
      expect(modelSupportsVision('my-ephemeral-model')).toBe(false);
    });

    it('respects 10-minute TTL expiry', () => {
      jest.useFakeTimers();
      try {
        registerRuntimeModelCapabilities('ttl-model', ['tools']);
        expect(modelSupportsTools('ttl-model')).toBe(true);

        // Advance 9 minutes -> still valid
        jest.advanceTimersByTime(9 * 60 * 1000);
        expect(modelSupportsTools('ttl-model')).toBe(true);

        // Advance 2 more minutes (11 minutes total) -> expired
        jest.advanceTimersByTime(2 * 60 * 1000);
        expect(modelSupportsTools('ttl-model')).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
