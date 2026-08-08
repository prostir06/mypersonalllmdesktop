import { isRegistrationAllowed } from '../utils/registrationGate';

describe('isRegistrationAllowed', () => {
  const prevAllow = process.env.ALLOW_REGISTRATION;
  const prevEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevAllow === undefined) delete process.env.ALLOW_REGISTRATION;
    else process.env.ALLOW_REGISTRATION = prevAllow;
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
  });

  it('defaults to false in production when unset', () => {
    delete process.env.ALLOW_REGISTRATION;
    process.env.NODE_ENV = 'production';
    expect(isRegistrationAllowed()).toBe(false);
  });

  it('defaults to true outside production when unset', () => {
    delete process.env.ALLOW_REGISTRATION;
    process.env.NODE_ENV = 'test';
    expect(isRegistrationAllowed()).toBe(true);
  });

  it('honors explicit ALLOW_REGISTRATION=false', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_REGISTRATION = 'false';
    expect(isRegistrationAllowed()).toBe(false);
  });

  it('honors explicit ALLOW_REGISTRATION=true in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_REGISTRATION = 'true';
    expect(isRegistrationAllowed()).toBe(true);
  });
});
