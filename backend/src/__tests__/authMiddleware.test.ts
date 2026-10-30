import jwt from 'jsonwebtoken';
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/express';
import auth from '../middleware/auth';
import optionalAuth from '../middleware/optionalAuth';
import logger from '../logger';

process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe('auth middleware JWT algorithms', () => {
  it('accepts HS256 tokens', () => {
    const token = jwt.sign({ userId: 7 }, process.env.JWT_SECRET as string, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
    const req = {
      header: (name: string) =>
        name === 'Authorization' ? `Bearer ${token}` : undefined,
    } as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    auth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe(7);
  });

  it('includes requestId when token is missing', () => {
    const req = {
      id: 'rid-missing-token',
      header: () => undefined,
    } as unknown as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'No token, authorization denied',
      requestId: 'rid-missing-token',
    });
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
      header: (name: string) =>
        name === 'Authorization' ? `Bearer ${noneToken}` : undefined,
    } as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    auth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('includes requestId when token is invalid', () => {
    const req = {
      id: 'rid-invalid-token',
      header: (name: string) =>
        name === 'Authorization' ? 'Bearer not-a-jwt' : undefined,
    } as unknown as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Token is not valid',
      requestId: 'rid-invalid-token',
    });
  });

  it('logs debug information when token verification fails', () => {
    const loggerDebugSpy = jest.spyOn(logger, 'debug');

    const req = {
      id: 'rid-invalid-token',
      header: (name: string) =>
        name === 'Authorization' ? 'Bearer invalid-token-string' : undefined,
    } as unknown as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Auth verification failed:/)
    );
  });
});

describe('optionalAuth middleware', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sets userId and calls next when token is valid', () => {
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET as string, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
    const req = {
      header: (name: string) =>
        name === 'Authorization' ? `Bearer ${token}` : undefined,
    } as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe(42);
  });

  it('logs debug and proceeds unauthenticated when token is invalid', () => {
    const loggerDebugSpy = jest.spyOn(logger, 'debug');
    const req = {
      header: (name: string) =>
        name === 'Authorization' ? 'Bearer corrupted-token' : undefined,
    } as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBeUndefined();
    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/optionalAuth: token verification failed:/)
    );
  });

  it('proceeds unauthenticated without logging when no token is present', () => {
    const loggerDebugSpy = jest.spyOn(logger, 'debug');
    const req = {
      header: () => undefined,
    } as unknown as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBeUndefined();
    expect(loggerDebugSpy).not.toHaveBeenCalled();
  });
});
