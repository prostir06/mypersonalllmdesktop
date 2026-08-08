const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

const auth = require('../middleware/auth');

describe('auth middleware JWT algorithms', () => {
  it('accepts HS256 tokens', () => {
    const token = jwt.sign({ userId: 7 }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
    const req = {
      header: (name) =>
        name === 'Authorization' ? `Bearer ${token}` : undefined,
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    auth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe(7);
  });

  it('rejects tokens signed with a non-HS256 algorithm', () => {
    const payload = Buffer.from(
      JSON.stringify({ userId: 1, iat: Math.floor(Date.now() / 1000) })
    ).toString('base64url');
    const noneHeader = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' })
    ).toString('base64url');
    const noneToken = `${noneHeader}.${payload}.`;

    const req = {
      header: (name) =>
        name === 'Authorization' ? `Bearer ${noneToken}` : undefined,
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    auth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
