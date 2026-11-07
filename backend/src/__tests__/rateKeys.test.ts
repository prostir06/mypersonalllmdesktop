import jwt from 'jsonwebtoken';
import { chatRateKey, loginRateKey } from '../middleware/rateKeys';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

describe('rate limit keys', () => {
  it('buckets login attempts by a hash of the email', () => {
    const first = loginRateKey({ body: { email: 'Ada@Example.com' }, ip: '1.1.1.1' });
    const second = loginRateKey({ body: { email: 'ada@example.com' }, ip: '2.2.2.2' });
    expect(first).toBe(second);
    expect(first.startsWith('login:')).toBe(true);
    expect(first).not.toContain('ada@example.com');
  });

  it('buckets chat by user id when the access token is valid', () => {
    const token = jwt.sign({ userId: 7 }, process.env.JWT_SECRET as string, {
      expiresIn: '1h',
      issuer: 'llm-assistant',
      audience: 'llm-assistant-api',
    });
    const key = chatRateKey({
      ip: '1.1.1.1',
      header: (name) => (name === 'Authorization' ? `Bearer ${token}` : undefined),
    });
    expect(key).toBe('user:7');
  });

  it('falls back to the IP when the chat token is missing', () => {
    expect(
      chatRateKey({
        ip: '9.9.9.9',
        header: () => undefined,
      })
    ).toBe('ip:9.9.9.9');
  });
});
