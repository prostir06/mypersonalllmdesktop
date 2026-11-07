export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';
export const QUOTA_EXCEEDED_MESSAGE =
  'Ліміт на сьогодні вичерпано — додайте власний ключ';
export const DEFAULT_SHARED_KEY_DAILY_LIMIT_USD = 1;

/** ALLOW_SHARED_PROVIDER_KEYS overrides. Unset allows the env key outside production. */
export function sharedKeysAllowed(): boolean {
  const raw = process.env.ALLOW_SHARED_PROVIDER_KEYS;
  if (raw !== undefined && String(raw).trim() !== '') {
    const value = String(raw).trim().toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(value);
  }
  return process.env.NODE_ENV !== 'production';
}

export function sharedKeyDailyLimitUsd(): number {
  const raw = process.env.SHARED_KEY_DAILY_LIMIT_USD;
  if (raw === undefined || String(raw).trim() === '') {
    return DEFAULT_SHARED_KEY_DAILY_LIMIT_USD;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_SHARED_KEY_DAILY_LIMIT_USD;
  return value;
}

export function utcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
