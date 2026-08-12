import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildChatDeepLink,
  findDeepLinkArg,
  parseDeepLink,
} from './deepLinks';

describe('parseDeepLink', () => {
  it('parses mypersonalllm://chat/42', () => {
    assert.deepEqual(parseDeepLink('mypersonalllm://chat/42'), {
      type: 'chat',
      conversationId: '42',
    });
  });

  it('parses host-style chat path', () => {
    assert.deepEqual(parseDeepLink('mypersonalllm://chat/7'), {
      type: 'chat',
      conversationId: '7',
    });
  });

  it('rejects invalid ids and protocols', () => {
    assert.equal(parseDeepLink('https://example.com/chat/1'), null);
    assert.equal(parseDeepLink('mypersonalllm://chat/abc'), null);
    assert.equal(parseDeepLink('mypersonalllm://other/1'), null);
    assert.equal(parseDeepLink('not-a-url'), null);
  });
});

describe('buildChatDeepLink', () => {
  it('builds protocol URL for numeric ids', () => {
    assert.equal(buildChatDeepLink(5), 'mypersonalllm://chat/5');
  });

  it('throws for invalid ids', () => {
    assert.throws(() => buildChatDeepLink('nope'), /Invalid conversation id/);
  });
});

describe('findDeepLinkArg', () => {
  it('finds deep link in process argv', () => {
    assert.equal(
      findDeepLinkArg(['electron', 'mypersonalllm://chat/9']),
      'mypersonalllm://chat/9'
    );
  });
});
