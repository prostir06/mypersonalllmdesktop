import { resolveRegistrationRole } from '../auth/roles';

describe('resolveRegistrationRole', () => {
  const previous = process.env.ADMIN_EMAIL;

  afterEach(() => {
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
  });

  it('makes the first user admin when ADMIN_EMAIL is unset', () => {
    delete process.env.ADMIN_EMAIL;
    expect(resolveRegistrationRole('a@b.com', 0)).toBe('admin');
    expect(resolveRegistrationRole('a@b.com', 2)).toBe('member');
  });

  it('makes only ADMIN_EMAIL an admin when it is set', () => {
    process.env.ADMIN_EMAIL = ' Owner@Example.com ';
    expect(resolveRegistrationRole('owner@example.com', 3)).toBe('admin');
    expect(resolveRegistrationRole('other@example.com', 0)).toBe('member');
  });
});
