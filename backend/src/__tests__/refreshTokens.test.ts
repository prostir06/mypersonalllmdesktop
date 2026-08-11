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

  it('concurrent rotations: only one wins', async () => {
    const raw = 'concurrent-token-test';
    const row = {
      id: 10,
      userId: 5,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    };

    // Both calls find the token, but only the first updateMany succeeds.
    mockedPrisma.refreshToken.findUnique
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(row);
    mockedPrisma.refreshToken.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mockedPrisma.refreshToken.create.mockResolvedValue({
      id: 11,
      userId: 5,
      tokenHash: 'new-hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });

    const [r1, r2] = await Promise.all([
      rotateRefreshToken(raw),
      rotateRefreshToken(raw),
    ]);

    const results = [r1, r2];
    const winners = results.filter(Boolean);
    const losers = results.filter((r) => r === null);
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
  });
});
