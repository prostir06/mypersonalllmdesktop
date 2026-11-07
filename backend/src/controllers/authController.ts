import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import prisma from '../config/prisma';
import logger from '../logger';
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  setRefreshCookie,
} from '../utils/refreshTokens';
import { isRegistrationAllowed } from '../utils/registrationGate';
import { resolveRegistrationRole } from '../auth/roles';
import { claimInvite, releaseInvite } from '../services/admin/invites';
import { jsonError, jsonValidationErrors } from '../utils/httpJson';
import type { AuthRequest } from '../types/express';

class JwtSecretMissingError extends Error {
  constructor() {
    super('JWT_SECRET is not configured');
    this.name = 'JwtSecretMissingError';
  }
}

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new JwtSecretMissingError();
  }
  return secret;
}

function signAccessToken(userId: number): string {
  const secret = requireJwtSecret();
  const expiresIn = (process.env.JWT_ACCESS_EXPIRE ||
    process.env.JWT_EXPIRE ||
    '15m') as SignOptions['expiresIn'];
  return jwt.sign({ userId }, secret, { algorithm: 'HS256', expiresIn });
}

async function attachSession(res: Response, userId: number): Promise<string> {
  const access = signAccessToken(userId);
  const refreshRaw = await issueRefreshToken(userId);
  setRefreshCookie(res, refreshRaw);
  return access;
}

let dummyHashPromise = bcrypt.hash('dummy-password-for-timing', 12);
void dummyHashPromise.catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(`Failed to warm dummy bcrypt hash: ${message}`);
});

async function getDummyHash(): Promise<string> {
  try {
    return await dummyHashPromise;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Dummy bcrypt hash unavailable, re-warming: ${message}`);
    dummyHashPromise = bcrypt.hash('dummy-password-for-timing', 12);
    return dummyHashPromise;
  }
}

export async function register(req: AuthRequest, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    jsonValidationErrors(res, req, errors.array());
    return;
  }

  const { email, password, name } = req.body as {
    email: string;
    password: string;
    name: string;
    invite?: string;
  };
  const invite = typeof req.body.invite === 'string' ? req.body.invite.trim() : '';
  if (!isRegistrationAllowed() && !invite) {
    jsonError(res, req, 403, 'Реєстрація нових користувачів вимкнена');
    return;
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      jsonError(res, req, 400, 'Користувач з таким email вже існує');
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    if (invite) {
      const claimed = await claimInvite(invite);
      if (!claimed) {
        jsonError(res, req, 403, 'Запрошення недійсне або вже використане');
        return;
      }
    }
    const existingUsers = await prisma.user.count();
    let user: { id: number };
    try {
      user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: resolveRegistrationRole(email, existingUsers),
        },
        select: { id: true },
      });
    } catch (error: unknown) {
      if (invite) await releaseInvite(invite);
      throw error;
    }

    const token = await attachSession(res, user.id);
    logger.info(`New user registered: ${email} (id=${user.id})`);
    res.status(201).json({ token, userId: user.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /auth/register error: ${message}`);
    if (error instanceof JwtSecretMissingError) {
      jsonError(res, req, 500, 'Помилка конфігурації сервера');
      return;
    }
    jsonError(res, req, 500, 'Помилка сервера при реєстрації');
  }
}

export async function login(req: AuthRequest, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    jsonValidationErrors(res, req, errors.array());
    return;
  }

  const { email, password } = req.body as { email: string; password: string };

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    const hash = user?.password ?? (await getDummyHash());
    const isPasswordValid = await bcrypt.compare(password, hash);

    if (!user || !isPasswordValid) {
      jsonError(res, req, 400, 'Невірний email або пароль');
      return;
    }
    if (user.blocked) {
      jsonError(res, req, 403, 'Обліковий запис заблоковано');
      return;
    }

    const token = await attachSession(res, user.id);
    logger.info(`User logged in: ${email} (id=${user.id})`);
    res.json({ token, userId: user.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /auth/login error: ${message}`);
    if (error instanceof JwtSecretMissingError) {
      jsonError(res, req, 500, 'Помилка конфігурації сервера');
      return;
    }
    jsonError(res, req, 500, 'Помилка сервера при вході');
  }
}

export async function refresh(req: AuthRequest, res: Response): Promise<void> {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      jsonError(res, req, 401, 'Токен відсутній');
      return;
    }

    // Ensure JWT_SECRET is configured before rotating
    requireJwtSecret();

    const rotated = await rotateRefreshToken(raw);
    if (!rotated) {
      clearRefreshCookie(res);
      jsonError(res, req, 401, 'Невалідний токен');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: rotated.userId },
      select: { id: true, blocked: true },
    });
    if (!user || user.blocked) {
      clearRefreshCookie(res);
      jsonError(res, req, user ? 403 : 401, user ? 'Обліковий запис заблоковано' : 'Користувача не знайдено');
      return;
    }

    setRefreshCookie(res, rotated.raw);
    const token = signAccessToken(user.id);
    res.json({ token });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /auth/refresh error: ${message}`);
    if (error instanceof JwtSecretMissingError) {
      jsonError(res, req, 500, 'Помилка конфігурації сервера');
      return;
    }
    jsonError(res, req, 401, 'Невалідний токен');
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) {
      await revokeRefreshToken(raw);
    }
    clearRefreshCookie(res);
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /auth/logout error: ${message}`);
    clearRefreshCookie(res);
    res.json({ success: true });
  }
}
