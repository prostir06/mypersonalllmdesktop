import { describe, it, expect } from 'vitest';
import { modelSupportsVision } from './modelSupportsVision';

describe('modelSupportsVision', () => {
  const catalog = [
    { model_id: 'gpt-4o-mini', supports_vision: true },
    { model_id: 'gpt-4', supports_vision: false },
    { model_id: 'llama3' },
  ];

  it('uses catalog supports_vision flag', () => {
    expect(modelSupportsVision('gpt-4o-mini', catalog)).toBe(true);
    expect(modelSupportsVision('gpt-4', catalog)).toBe(false);
    expect(modelSupportsVision('llama3', catalog)).toBe(false);
  });

  it('does not infer vision from model id substrings', () => {
    expect(modelSupportsVision('gpt-4o', [])).toBe(false);
    expect(modelSupportsVision('gpt-4-vision-preview', undefined)).toBe(false);
  });

  it('supports vision for Claude 3 and 3.5 models via name fallback', () => {
    expect(modelSupportsVision('claude-3-5-sonnet-20241022')).toBe(true);
    expect(modelSupportsVision('claude-3-5-haiku-20241022')).toBe(true);
    expect(modelSupportsVision('claude-3-opus-20240229')).toBe(true);
    expect(modelSupportsVision('Claude-3.5-Sonnet')).toBe(true);
  });
});
