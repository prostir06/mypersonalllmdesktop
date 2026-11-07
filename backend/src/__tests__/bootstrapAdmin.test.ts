jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  warn: jest.fn(),
}));

import prisma from '../config/prisma';
import { ensureBootstrapAdmin } from '../auth/bootstrapAdmin';

const user = (prisma as unknown as {
  user: { findFirst: jest.Mock; update: jest.Mock };
}).user;

describe('ensureBootstrapAdmin', () => {
  const previous = process.env.ADMIN_EMAIL;

  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
  });

  it('promotes the configured email', async () => {
    process.env.ADMIN_EMAIL = 'owner@example.com';
    user.findFirst.mockResolvedValue({ id: 4 });

    await ensureBootstrapAdmin();

    expect(user.update).toHaveBeenCalledWith({ where: { id: 4 }, data: { role: 'admin' } });
  });

  it('does nothing when ADMIN_EMAIL is not registered yet', async () => {
    process.env.ADMIN_EMAIL = 'missing@example.com';
    user.findFirst.mockResolvedValue(null);

    await ensureBootstrapAdmin();

    expect(user.update).not.toHaveBeenCalled();
  });

  it('promotes the earliest user when no admin exists and ADMIN_EMAIL is unset', async () => {
    delete process.env.ADMIN_EMAIL;
    user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 });

    await ensureBootstrapAdmin();

    expect(user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { role: 'admin' } });
  });
});
