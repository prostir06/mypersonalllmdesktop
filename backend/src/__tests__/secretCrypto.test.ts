import {
  decryptSecret,
  encryptSecret,
  EncryptionConfigError,
  parseEncryptionKey,
} from '../utils/secretCrypto';

describe('secretCrypto', () => {
  const prev = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = prev;
  });

  it('round-trips plaintext for the same user', () => {
    const blob = encryptSecret('sk-test-secret', 42);
    expect(blob).not.toContain('sk-test');
    expect(decryptSecret(blob, 42)).toBe('sk-test-secret');
  });

  it('fails decrypt with wrong user AAD', () => {
    const blob = encryptSecret('sk-test-secret', 1);
    expect(() => decryptSecret(blob, 2)).toThrow();
  });

  it('parseEncryptionKey rejects missing key', () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => parseEncryptionKey()).toThrow(EncryptionConfigError);
    process.env.ENCRYPTION_KEY = saved;
  });
});
