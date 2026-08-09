import {
  assertAllowedHttpUrl,
  assertAllowedHttpUrlWithDns,
  isUnsafeResolvedAddress,
} from '../utils/urlAllowlist';

jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

const dns = require('dns/promises') as { lookup: jest.Mock };

describe('assertAllowedHttpUrl', () => {
  const prev = process.env.OLLAMA_URL_ALLOWLIST;

  afterEach(() => {
    if (prev === undefined) delete process.env.OLLAMA_URL_ALLOWLIST;
    else process.env.OLLAMA_URL_ALLOWLIST = prev;
    dns.lookup.mockReset();
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

describe('assertAllowedHttpUrlWithDns', () => {
  const prev = process.env.OLLAMA_URL_ALLOWLIST;

  afterEach(() => {
    if (prev === undefined) delete process.env.OLLAMA_URL_ALLOWLIST;
    else process.env.OLLAMA_URL_ALLOWLIST = prev;
    dns.lookup.mockReset();
  });

  it('rejects allowlisted host that resolves to link-local', async () => {
    process.env.OLLAMA_URL_ALLOWLIST = 'evil.lan';
    dns.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(
      assertAllowedHttpUrlWithDns('http://evil.lan:11434')
    ).rejects.toThrow(/blocked address/i);
  });

  it('allows allowlisted host that resolves to RFC1918', async () => {
    process.env.OLLAMA_URL_ALLOWLIST = 'ollama.lan';
    dns.lookup.mockResolvedValue([{ address: '192.168.1.10', family: 4 }]);
    const u = await assertAllowedHttpUrlWithDns('http://ollama.lan:11434');
    expect(u.hostname).toBe('ollama.lan');
  });

  it('skips DNS for literal loopback IP', async () => {
    const u = await assertAllowedHttpUrlWithDns('http://127.0.0.1:11434');
    expect(u.hostname).toBe('127.0.0.1');
    expect(dns.lookup).not.toHaveBeenCalled();
  });
});

describe('isUnsafeResolvedAddress', () => {
  it('flags link-local and unspecified', () => {
    expect(isUnsafeResolvedAddress('169.254.1.1')).toBe(true);
    expect(isUnsafeResolvedAddress('0.0.0.0')).toBe(true);
    expect(isUnsafeResolvedAddress('fe80::1')).toBe(true);
    expect(isUnsafeResolvedAddress('192.168.0.1')).toBe(false);
  });
});
