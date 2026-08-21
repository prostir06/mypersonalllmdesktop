import { describe, it, expect } from 'vitest';
import { catalogModelsToOptions } from './catalogModelOptions';

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

  it('returns empty for unknown provider or bad input', () => {
    expect(catalogModelsToOptions(catalog, 'anthropic')).toEqual([]);
    expect(catalogModelsToOptions(null, 'openai')).toEqual([]);
    expect(catalogModelsToOptions(catalog, '')).toEqual([]);
  });
});
