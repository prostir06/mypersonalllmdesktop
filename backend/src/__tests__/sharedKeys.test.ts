import {
  DEFAULT_SHARED_KEY_DAILY_LIMIT_USD,
  sharedKeyDailyLimitUsd,
  sharedKeysAllowed,
  utcDay,
} from '../services/usage/sharedKeys';

describe('shared key policy', () => {
  const previousFlag = process.env.ALLOW_SHARED_PROVIDER_KEYS;
  const previousNode = process.env.NODE_ENV;
  const previousLimit = process.env.SHARED_KEY_DAILY_LIMIT_USD;

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.ALLOW_SHARED_PROVIDER_KEYS;
    else process.env.ALLOW_SHARED_PROVIDER_KEYS = previousFlag;
    if (previousNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNode;
    if (previousLimit === undefined) delete process.env.SHARED_KEY_DAILY_LIMIT_USD;
    else process.env.SHARED_KEY_DAILY_LIMIT_USD = previousLimit;
  });

  it('allows an unset flag outside production and blocks it in production', () => {
    delete process.env.ALLOW_SHARED_PROVIDER_KEYS;
    process.env.NODE_ENV = 'test';
    expect(sharedKeysAllowed()).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(sharedKeysAllowed()).toBe(false);
  });

  it('honors an explicit flag', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_SHARED_PROVIDER_KEYS = 'true';
    expect(sharedKeysAllowed()).toBe(true);
    process.env.ALLOW_SHARED_PROVIDER_KEYS = 'false';
    expect(sharedKeysAllowed()).toBe(false);
  });

  it('uses 1 USD when the daily limit is unset or invalid', () => {
    delete process.env.SHARED_KEY_DAILY_LIMIT_USD;
    expect(sharedKeyDailyLimitUsd()).toBe(DEFAULT_SHARED_KEY_DAILY_LIMIT_USD);
    process.env.SHARED_KEY_DAILY_LIMIT_USD = 'nope';
    expect(sharedKeyDailyLimitUsd()).toBe(1);
    process.env.SHARED_KEY_DAILY_LIMIT_USD = '2.5';
    expect(sharedKeyDailyLimitUsd()).toBe(2.5);
  });

  it('stores the UTC calendar day', () => {
    expect(utcDay(new Date('2026-11-07T23:30:00.000Z')).toISOString()).toBe(
      '2026-11-07T00:00:00.000Z'
    );
  });
});
