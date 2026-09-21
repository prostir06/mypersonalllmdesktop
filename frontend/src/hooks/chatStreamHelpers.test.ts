import { describe, it, expect } from 'vitest';
import { appendOrReplaceAssistant, mapChatError } from './chatStreamHelpers';
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

describe('mapChatError', () => {
  it('maps API key failures to friendly settings hint', () => {
    expect(mapChatError('401 unauthorized api key invalid')).toContain(
      'Перевірте Налаштування AI'
    );
  });

  it('maps network failures to retry-friendly message', () => {
    expect(mapChatError('network timeout')).toContain('Спробуйте ще раз');
  });
});
