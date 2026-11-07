jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    llmModel: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
  prisma: {
    llmModel: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import axios from 'axios';
import {
  DEFAULT_CLAUDE_MODELS,
  DEFAULT_GEMINI_MODELS,
  DEFAULT_MODELS,
  parseModelId,
  toPublicModel,
  discoverRemoteOllamaModels,
} from '../services/modelsService';
import ProviderFactory from '../services/providerFactory';
import {
  clearRuntimeModelCapabilitiesCache,
  modelSupportsVision,
  modelSupportsTools,
} from '../utils/modelCapabilities';

describe('modelsService', () => {
  beforeEach(() => {
    clearRuntimeModelCapabilitiesCache();
    jest.restoreAllMocks();
  });

  describe('DEFAULT_CLAUDE_MODELS', () => {
    it('defines current Claude models with anthropic provider', () => {
      expect(DEFAULT_CLAUDE_MODELS).toHaveLength(2);

      const sonnet = DEFAULT_CLAUDE_MODELS.find(
        (m) => m.modelId === 'claude-sonnet-4-5'
      );
      expect(sonnet).toBeDefined();
      expect(sonnet).toMatchObject({
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        maxTokens: 4096,
        temperature: 0.7,
      });

      const haiku = DEFAULT_CLAUDE_MODELS.find(
        (m) => m.modelId === 'claude-haiku-4-5'
      );
      expect(haiku).toBeDefined();
      expect(haiku).toMatchObject({
        name: 'Claude Haiku 4.5',
        provider: 'anthropic',
        maxTokens: 4096,
        temperature: 0.7,
      });
    });

    it('includes DEFAULT_CLAUDE_MODELS in DEFAULT_MODELS', () => {
      const claudeInDefaults = DEFAULT_MODELS.filter(
        (m) => m.provider === 'anthropic'
      );
      expect(claudeInDefaults).toHaveLength(DEFAULT_CLAUDE_MODELS.length);
      for (const m of DEFAULT_CLAUDE_MODELS) {
        expect(
          DEFAULT_MODELS.some(
            (def) => def.modelId === m.modelId && def.provider === 'anthropic'
          )
        ).toBe(true);
      }
    });
  });

  describe('parseModelId', () => {
    it('parses valid numeric string ids', () => {
      expect(parseModelId('123')).toBe(123);
      expect(parseModelId('1')).toBe(1);
    });

    it('returns null for non-numeric or invalid strings', () => {
      expect(parseModelId('abc')).toBeNull();
      expect(parseModelId('12a')).toBeNull();
      expect(parseModelId('')).toBeNull();
    });
  });

  describe('toPublicModel', () => {
    it('formats a model row and includes vision and tools capability flags', () => {
      const row = {
        id: 10,
        userId: 1,
        name: 'Claude 3.5 Sonnet',
        modelId: 'claude-3-5-sonnet-20241022',
        description: 'Anthropic Claude model',
        provider: 'anthropic',
        temperature: 0.7,
        maxTokens: 4096,
        isDefault: true,
        createdAt: new Date('2026-10-30T00:00:00Z'),
      };

      const publicModel = toPublicModel(row);
      expect(publicModel).toMatchObject({
        id: 10,
        user_id: 1,
        name: 'Claude 3.5 Sonnet',
        model_id: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        supports_vision: true,
        supports_tools: true,
      });
    });

    it('returns false for tools and vision on llama2', () => {
      const row = {
        id: 11,
        userId: null,
        name: 'Llama 2',
        modelId: 'llama2',
        description: 'Local Ollama model',
        provider: 'ollama',
        temperature: 0.7,
        maxTokens: 2000,
        isDefault: true,
        createdAt: new Date('2026-10-30T00:00:00Z'),
      };

      const publicModel = toPublicModel(row);
      expect(publicModel.supports_vision).toBe(false);
      expect(publicModel.supports_tools).toBe(false);
    });
  });

  describe('discoverRemoteOllamaModels', () => {
    it('discovers models from /api/tags, registers runtime capabilities, and returns enriched flags', async () => {
      const mockResponse = {
        status: 200,
        data: {
          models: [
            {
              name: 'deepseek-r1-custom:latest',
              model: 'deepseek-r1-custom:latest',
              capabilities: ['tools'],
            },
            {
              name: 'custom-vl:latest',
              model: 'custom-vl:latest',
              capabilities: ['vision', 'tools'],
            },
          ],
        },
      };

      jest.spyOn(axios, 'get').mockResolvedValue(mockResponse);

      const discovered = await discoverRemoteOllamaModels('http://127.0.0.1:11434');

      expect(discovered).toEqual([
        {
          id: 'deepseek-r1-custom:latest',
          name: 'deepseek-r1-custom:latest',
          supports_vision: false,
          supports_tools: true,
        },
        {
          id: 'custom-vl:latest',
          name: 'custom-vl:latest',
          supports_vision: true,
          supports_tools: true,
        },
      ]);

      // Verify that runtime capabilities were cached in modelCapabilities
      expect(modelSupportsTools('deepseek-r1-custom:latest')).toBe(true);
      expect(modelSupportsVision('deepseek-r1-custom:latest')).toBe(false);
      expect(modelSupportsVision('custom-vl:latest')).toBe(true);
    });
  });
});

describe('ProviderFactory - Anthropic Registration', () => {
  it('includes anthropic in available providers', () => {
    const providers = ProviderFactory.getAvailableProviders();
    expect(providers).toContain('anthropic');
  });

  it('resolves anthropic provider handlers for send and stream', () => {
    const handlers = ProviderFactory.getProvider('anthropic');
    expect(handlers).toBeDefined();
    expect(typeof handlers.send).toBe('function');
    expect(typeof handlers.stream).toBe('function');
  });
});
