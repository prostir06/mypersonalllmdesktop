import { describe, expect, it } from 'vitest';
import { modelSupportsTools } from './modelSupportsTools';

describe('modelSupportsTools', () => {
  it('returns false for null or undefined model', () => {
    expect(modelSupportsTools(null)).toBe(false);
    expect(modelSupportsTools(undefined)).toBe(false);
    expect(modelSupportsTools('')).toBe(false);
  });

  it('respects catalog flag when present', () => {
    const catalog = [
      { model_id: 'custom-model', supports_tools: true },
      { model_id: 'other-model', supports_tools: false },
    ];
    expect(modelSupportsTools('custom-model', catalog)).toBe(true);
    expect(modelSupportsTools('other-model', catalog)).toBe(false);
  });

  it('returns true for known tool-supporting providers', () => {
    expect(modelSupportsTools('any-model', [], 'openai')).toBe(true);
    expect(modelSupportsTools('any-model', [], 'anthropic')).toBe(true);
    expect(modelSupportsTools('any-model', [], 'gemini')).toBe(true);
  });

  it('infers tool support from model name heuristics', () => {
    expect(modelSupportsTools('gpt-4o', [])).toBe(true);
    expect(modelSupportsTools('claude-3-5-sonnet', [])).toBe(true);
    expect(modelSupportsTools('gemini-1.5-pro', [])).toBe(true);
    expect(modelSupportsTools('llama3.1-8b', [])).toBe(true);
    expect(modelSupportsTools('qwen2.5-coder', [])).toBe(true);
    expect(modelSupportsTools('mistral-large', [])).toBe(true);
    expect(modelSupportsTools('mixtral-8x7b', [])).toBe(true);
    expect(modelSupportsTools('command-r-plus', [])).toBe(true);
    expect(modelSupportsTools('firefunction-v2', [])).toBe(true);
    expect(modelSupportsTools('hermes-3', [])).toBe(true);
    expect(modelSupportsTools('unknown-text-model', [])).toBe(false);
  });
});
