import crypto from 'crypto';

export function hashPii(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 12);
}
