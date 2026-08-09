import { describe, expect, it } from 'vitest';
import { gravatarUrl, md5Hex } from './gravatar';

describe('md5Hex / gravatarUrl', () => {
  it('hashes empty string', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('hashes known email for Gravatar', () => {
    // MD5("test@example.com")
    expect(md5Hex('test@example.com')).toBe('55502f40dc8b7c769880b10874abc9d0');
  });

  it('builds gravatar URL with trimmed lowercase email', () => {
    expect(gravatarUrl('  Test@Example.com  ', 120)).toBe(
      'https://www.gravatar.com/avatar/55502f40dc8b7c769880b10874abc9d0?s=120&d=identicon'
    );
  });
});
