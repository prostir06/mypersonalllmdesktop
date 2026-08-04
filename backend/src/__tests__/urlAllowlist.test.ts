import { assertAllowedHttpUrl } from '../utils/urlAllowlist';

describe('assertAllowedHttpUrl', () => {
  const prev = process.env.OLLAMA_URL_ALLOWLIST;

  afterEach(() => {
    if (prev === undefined) delete process.env.OLLAMA_URL_ALLOWLIST;
    else process.env.OLLAMA_URL_ALLOWLIST = prev;
  });

  it('allows 127.0.0.1 with path', () => {
    const u = assertAllowedHttpUrl(
      'http://127.0.0.1:11434/v1/chat/completions'
    );
    expect(u.hostname).toBe('127.0.0.1');
    expect(u.port).toBe('11434');
  });

  it('allows localhost', () => {
    expect(assertAllowedHttpUrl('http://localhost:11434').hostname).toBe(
      'localhost'
    );
  });

  it('allows host.docker.internal', () => {
    expect(
      assertAllowedHttpUrl(
        'http://host.docker.internal:11434/v1/chat/completions'
      ).hostname
    ).toBe('host.docker.internal');
  });

  it('rejects link-local metadata IP', () => {
    expect(() =>
      assertAllowedHttpUrl('http://169.254.169.254/latest/meta-data')
    ).toThrow(/not allowed/i);
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => assertAllowedHttpUrl('file:///etc/passwd')).toThrow();
  });

  it('rejects arbitrary public host by default', () => {
    expect(() =>
      assertAllowedHttpUrl('http://evil.example.com/v1/chat')
    ).toThrow(/not allowed/i);
  });

  it('allows extra hostname from OLLAMA_URL_ALLOWLIST', () => {
    process.env.OLLAMA_URL_ALLOWLIST = 'ollama.lan,my-pc.local';
    expect(
      assertAllowedHttpUrl('http://ollama.lan:11434/api/tags').hostname
    ).toBe('ollama.lan');
  });
});
