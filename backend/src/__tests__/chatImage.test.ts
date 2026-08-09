import {
  assertChatImage,
  MAX_CHAT_IMAGE_BYTES,
} from '../utils/chatImage';

describe('assertChatImage', () => {
  it('allows small data:image jpeg', () => {
    const tiny = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    expect(() =>
      assertChatImage(`data:image/jpeg;base64,${tiny}`)
    ).not.toThrow();
  });

  it('rejects http(s) URLs', () => {
    expect(() =>
      assertChatImage('https://evil.example/x.png')
    ).toThrow(/Віддалені URL/i);
  });

  it('rejects non-image data URIs', () => {
    expect(() =>
      assertChatImage('data:text/plain;base64,YQ==')
    ).toThrow(/data:image/i);
  });

  it('rejects oversized base64 payloads', () => {
    const bytes = Math.ceil(MAX_CHAT_IMAGE_BYTES * 1.2);
    const b64 = Buffer.alloc(bytes, 1).toString('base64');
    expect(() =>
      assertChatImage(`data:image/png;base64,${b64}`)
    ).toThrow(/ліміт/i);
  });
});
