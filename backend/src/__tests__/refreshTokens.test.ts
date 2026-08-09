jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import prisma from '../config/prisma';
import { hashRefreshToken, rotateRefreshToken } from '../utils/refreshTokens';

const mockedPrisma = prisma as unknown as {
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('rotateRefreshToken reuse detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('revokes all user tokens when a revoked refresh token is presented again', async () => {
    const raw = 'stolen-reuse-token';
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 9,
      userId: 42,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });
    mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

    const result = await rotateRefreshToken(raw);

    expect(result).toBeNull();
    expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockedPrisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('does not revoke-all when token is unknown', async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue(null);

    const result = await rotateRefreshToken('unknown');

    expect(result).toBeNull();
    expect(mockedPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rotates only when conditional revoke wins (count=1)', async () => {
    const raw = 'live-token';
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 3,
      userId: 7,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    mockedPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
    mockedPrisma.refreshToken.create.mockResolvedValue({
      id: 4,
      userId: 7,
      tokenHash: 'new',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await rotateRefreshToken(raw);

    expect(result).toEqual({ userId: 7, raw: expect.any(String) });
    expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 3, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockedPrisma.refreshToken.update).not.toHaveBeenCalled();
    expect(mockedPrisma.refreshToken.create).toHaveBeenCalled();
  });

  it('returns null without issuing when concurrent rotate already revoked (count=0)', async () => {
    const raw = 'raced-token';
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 3,
      userId: 7,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    mockedPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await rotateRefreshToken(raw);

    expect(result).toBeNull();
    expect(mockedPrisma.refreshToken.create).not.toHaveBeenCalled();
  });
});
