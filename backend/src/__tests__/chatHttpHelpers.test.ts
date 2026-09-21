import {
  isChatError,
  publicStreamErrorText,
  publicErrorJson,
} from '../services/chat/httpHelpers';

describe('chat httpHelpers', () => {
  const prev = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = prev;
  });

  it('isChatError detects statusCode', () => {
    expect(
      isChatError(Object.assign(new Error('x'), { statusCode: 403 }))
    ).toBe(true);
    expect(isChatError(new Error('x'))).toBe(false);
  });

  it('publicStreamErrorText masks in production', () => {
    process.env.NODE_ENV = 'production';
    expect(publicStreamErrorText('secret')).toBe('Stream failed');
    process.env.NODE_ENV = 'test';
    expect(publicStreamErrorText('secret')).toBe('secret');
  });

  it('publicErrorJson omits details in production', () => {
    process.env.NODE_ENV = 'production';
    const body = publicErrorJson(
      { id: 'r1' } as { id?: string },
      'Failed',
      'secret'
    );
    expect(body).toEqual({ error: 'Failed', requestId: 'r1' });
  });
});
