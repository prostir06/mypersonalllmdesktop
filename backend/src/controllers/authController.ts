import { Request, Response } from 'express';
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
  return jwt.sign({ userId }, secret, { expiresIn });
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
  } catch {
    dummyHashPromise = bcrypt.hash('dummy-password-for-timing', 12);
    return dummyHashPromise;
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email, password, name } = req.body as {
    email: string;
    password: string;
    name: string;
  };

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'Користувач з таким email вже існує' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
      select: { id: true },
    });

    const token = await attachSession(res, user.id);
    logger.info(`New user registered: ${email} (id=${user.id})`);
    res.status(201).json({ token, userId: user.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /auth/register error: ${message}`);
    if (error instanceof JwtSecretMissingError) {
      res.status(500).json({ error: 'Помилка конфігурації сервера' });
      return;
    }
    res.status(500).json({ error: 'Помилка сервера при реєстрації' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email, password } = req.body as { email: string; password: string };

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    const hash = user?.password ?? (await getDummyHash());
    const isPasswordValid = await bcrypt.compare(password, hash);

    if (!user || !isPasswordValid) {
      res.status(400).json({ error: 'Невірний email або пароль' });
      return;
    }

    const token = await attachSession(res, user.id);
    logger.info(`User logged in: ${email} (id=${user.id})`);
    res.json({ token, userId: user.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /auth/login error: ${message}`);
    if (error instanceof JwtSecretMissingError) {
      res.status(500).json({ error: 'Помилка конфігурації сервера' });
      return;
    }
    res.status(500).json({ error: 'Помилка сервера при вході' });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      res.status(401).json({ error: 'Токен відсутній' });
      return;
    }

    // Ensure JWT_SECRET is configured before rotating
    requireJwtSecret();

    const rotated = await rotateRefreshToken(raw);
    if (!rotated) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Невалідний токен' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: rotated.userId },
      select: { id: true },
    });
    if (!user) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Користувача не знайдено' });
      return;
    }

    setRefreshCookie(res, rotated.raw);
    const token = signAccessToken(user.id);
    res.json({ token });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /auth/refresh error: ${message}`);
    if (error instanceof JwtSecretMissingError) {
      res.status(500).json({ error: 'Помилка конфігурації сервера' });
      return;
    }
    res.status(401).json({ error: 'Невалідний токен' });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
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
