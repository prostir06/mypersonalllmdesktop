import { describe, it, expect } from 'vitest';
import { appendOrReplaceAssistant } from './chatStreamHelpers';
import type { Message } from '../types/api';

describe('appendOrReplaceAssistant', () => {
  const base: Message[] = [
    { role: 'user', content: 'u' },
    { role: 'assistant', content: 'old' },
  ];
  const next: Message = { role: 'assistant', content: 'new' };

  it('appends when no replace index', () => {
    expect(appendOrReplaceAssistant(base, next).map((m) => m.content)).toEqual([
      'u',
      'old',
      'new',
    ]);
  });

  it('replaces assistant at index', () => {
    expect(
      appendOrReplaceAssistant(base, next, 1).map((m) => m.content)
    ).toEqual(['u', 'new']);
  });
});
