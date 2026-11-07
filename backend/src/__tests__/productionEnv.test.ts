import { assertProductionConfig } from '../config/productionEnv';

describe('assertProductionConfig', () => {
  it('ignores CORS outside production', () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: 'development', CORS_ORIGIN: '' })
    ).not.toThrow();
  });

  it('requires CORS_ORIGIN in production', () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: 'production', CORS_ORIGIN: '  ' })
    ).toThrow('FATAL: CORS_ORIGIN must be set in production');
    expect(() =>
      assertProductionConfig({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://assistant.example.com',
      })
    ).not.toThrow();
  });
});
