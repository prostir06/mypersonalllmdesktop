import {
  defaultAnthropicModel,
  defaultModelFor,
  defaultOpenAiModel,
  lookupModelProfile,
} from '../config/models';

describe('config/models', () => {
  const envKeys = [
    'OPENAI_DEFAULT_MODEL',
    'ANTHROPIC_DEFAULT_MODEL',
    'GEMINI_DEFAULT_MODEL',
    'OLLAMA_DEFAULT_MODEL',
  ] as const;
  const previous: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it('uses current provider defaults', () => {
    expect(defaultOpenAiModel()).toBe('gpt-4o-mini');
    expect(defaultAnthropicModel()).toBe('claude-sonnet-4-5');
    expect(defaultModelFor('gemini')).toBe('gemini-2.0-flash');
    expect(defaultModelFor('ollama')).toBe('llama3.2');
    expect(defaultModelFor('anthropic')).toBe('claude-sonnet-4-5');
  });

  it('lets env override a provider default', () => {
    process.env.OPENAI_DEFAULT_MODEL = 'gpt-4.1-mini';
    expect(defaultModelFor('openai')).toBe('gpt-4.1-mini');
  });

  it('drops temperature for o-series and gpt-5 and keeps the longest profile', () => {
    expect(lookupModelProfile('o3-mini')?.temperature).toBe(false);
    expect(lookupModelProfile('o3-mini')?.maxTokensField).toBe('max_completion_tokens');
    expect(lookupModelProfile('gpt-5-nano')?.temperature).toBe(false);
    expect(lookupModelProfile('gpt-4o-mini-2024-07-18')?.vision).toBe(true);
    expect(lookupModelProfile('o4-mini')?.vision).toBe(true);
    expect(lookupModelProfile('unknown-local')).toBeUndefined();
  });
});
