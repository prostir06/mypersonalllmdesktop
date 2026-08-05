/**
 * AES-256-GCM helpers for at-rest secrets (server ENCRYPTION_KEY).
 */
import crypto from 'crypto';

export class EncryptionConfigError extends Error {
  constructor(message = 'ENCRYPTION_KEY is not configured or invalid') {
    super(message);
    this.name = 'EncryptionConfigError';
  }
}

/** 32-byte key from base64 or 64-char hex. */
export function parseEncryptionKey(raw = process.env.ENCRYPTION_KEY): Buffer {
  if (!raw || !String(raw).trim()) {
    throw new EncryptionConfigError();
  }
  const value = String(raw).trim();

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }

  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.length === 32) return buf;
  } catch {
    // fall through
  }

  throw new EncryptionConfigError('ENCRYPTION_KEY must be 32-byte base64 or 64 hex chars');
}

function aadForUser(userId: number): Buffer {
  return Buffer.from(`user:${userId}`, 'utf8');
}

export function encryptSecret(plaintext: string, userId: number): string {
  const key = parseEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aadForUser(userId));
  const enc = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString('base64');
}

export function decryptSecret(blob: string, userId: number): string {
  const key = parseEncryptionKey();
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < 12 + 16 + 1) {
    throw new Error('Invalid ciphertext');
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aadForUser(userId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
