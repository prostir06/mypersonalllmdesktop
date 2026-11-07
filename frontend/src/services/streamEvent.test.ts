import { describe, expect, it } from 'vitest';
import { parseStreamEvent } from './streamEvent';

describe('parseStreamEvent', () => {
  it('camelizes snake_case usage on a done event', () => {
    expect(
      parseStreamEvent({
        type: 'done',
        message_id: 4,
        content: 'ok',
        token_usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        },
      })
    ).toMatchObject({
      type: 'done',
      messageId: 4,
      tokenUsage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
  });

  it('rejects an event with the wrong token shape', () => {
    expect(parseStreamEvent({ type: 'token', token: 12 })).toBeNull();
  });

  it('uses the SSE event name when the payload has no type', () => {
    expect(
      parseStreamEvent(
        { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        'token_usage'
      )
    ).toMatchObject({ type: 'token_usage', promptTokens: 1 });
  });
});
