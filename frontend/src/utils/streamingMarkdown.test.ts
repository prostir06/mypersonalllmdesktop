import { describe, expect, it } from 'vitest';
import { splitStreamingMarkdown } from './streamingMarkdown';

describe('splitStreamingMarkdown', () => {
  it('keeps a single unfinished paragraph as plain tail', () => {
    expect(splitStreamingMarkdown('ще пишу')).toEqual({
      done: '',
      tail: 'ще пишу',
    });
  });

  it('parses blocks before the last blank line', () => {
    expect(splitStreamingMarkdown('Готово\n\nще')).toEqual({
      done: 'Готово',
      tail: 'ще',
    });
  });

  it('treats a trailing blank line as a finished block', () => {
    expect(splitStreamingMarkdown('Готово\n\n')).toEqual({
      done: 'Готово',
      tail: '',
    });
  });

  it('holds an open fence, including text before it, as the tail start', () => {
    expect(splitStreamingMarkdown('Вступ\n\n```ts\nconst x =')).toEqual({
      done: 'Вступ',
      tail: '```ts\nconst x =',
    });
  });

  it('releases a fence once it is closed and a later paragraph starts', () => {
    const text = '```ts\nconst x = 1\n```\n\nдалі';
    expect(splitStreamingMarkdown(text)).toEqual({
      done: '```ts\nconst x = 1\n```',
      tail: 'далі',
    });
  });
});
