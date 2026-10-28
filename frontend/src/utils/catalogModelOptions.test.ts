import { describe, it, expect } from 'vitest';
import {
  catalogModelsToOptions,
  DEFAULT_GEMINI_MODEL_OPTIONS,
} from './catalogModelOptions';

describe('catalogModelsToOptions', () => {
  const catalog = [
    { model_id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
    { model_id: 'llama3', name: 'Llama 3', provider: 'ollama' },
    { model_id: 'gpt-4o', name: '', provider: 'openai' },
  ];

  it('filters by provider and maps value/label', () => {
    expect(catalogModelsToOptions(catalog, 'openai')).toEqual([
      { value: 'gpt-4', label: 'GPT-4' },
      { value: 'gpt-4o', label: 'gpt-4o' },
    ]);
  });

  it('returns default gemini models when catalog has no gemini models', () => {
    expect(catalogModelsToOptions(catalog, 'gemini')).toEqual(
      DEFAULT_GEMINI_MODEL_OPTIONS
    );
    expect(catalogModelsToOptions(null, 'gemini')).toEqual(
      DEFAULT_GEMINI_MODEL_OPTIONS
    );
    expect(catalogModelsToOptions([], 'gemini')).toEqual(
      DEFAULT_GEMINI_MODEL_OPTIONS
    );
  });

  it('uses catalog models for gemini when present', () => {
    const customCatalog = [
      { model_id: 'gemini-custom', name: 'Custom Gemini', provider: 'gemini' },
    ];
    expect(catalogModelsToOptions(customCatalog, 'gemini')).toEqual([
      { value: 'gemini-custom', label: 'Custom Gemini' },
    ]);
  });

  it('returns empty for unknown provider or bad input', () => {
    expect(catalogModelsToOptions(catalog, 'anthropic')).toEqual([]);
    expect(catalogModelsToOptions(null, 'openai')).toEqual([]);
    expect(catalogModelsToOptions(catalog, '')).toEqual([]);
  });
});
