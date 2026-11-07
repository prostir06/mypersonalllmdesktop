import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/express';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
  },
}));

import prisma from '../config/prisma';
import requireAdmin from '../middleware/requireAdmin';

const findUnique = (prisma as unknown as { user: { findUnique: jest.Mock } }).user.findUnique;

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe('requireAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when the request has no user', async () => {
    const req = { id: 'rid' } as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 for a member', async () => {
    findUnique.mockResolvedValue({ role: 'member' });
    const req = { userId: 3 } as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe('Недостатньо прав');
  });

  it('calls next for an admin', async () => {
    findUnique.mockResolvedValue({ role: 'admin' });
    const req = { userId: 1 } as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
