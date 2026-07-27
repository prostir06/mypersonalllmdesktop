import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import prisma from '../config/prisma';
import logger from '../logger';

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

function signUserToken(userId: number): string {
  const secret = requireJwtSecret();
  const expiresIn = (process.env.JWT_EXPIRE || '7d') as SignOptions['expiresIn'];
  return jwt.sign({ userId }, secret, { expiresIn });
}

let cachedDummyHash: string | null = null;

async function getDummyHash(): Promise<string> {
  if (!cachedDummyHash) {
    cachedDummyHash = await bcrypt.hash('dummy-password-for-timing', 12);
  }
  return cachedDummyHash;
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

    const token = signUserToken(user.id);
    logger.info(`New user registered: ${email} (id=${user.id})`);
    res.status(201).json({ token, userId: user.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /auth/register error: ${message}`);
    if (message.includes('JWT_SECRET')) {
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

    const token = signUserToken(user.id);
    logger.info(`User logged in: ${email} (id=${user.id})`);
    res.json({ token, userId: user.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /auth/login error: ${message}`);
    res.status(500).json({ error: 'Помилка сервера при вході' });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'Токен відсутній' });
      return;
    }

    const secret = requireJwtSecret();
    const decoded = jwt.verify(token, secret, {
      ignoreExpiration: true,
    }) as { userId: number };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true },
    });
    if (!user) {
      res.status(401).json({ error: 'Користувача не знайдено' });
      return;
    }

    const newToken = signUserToken(user.id);
    res.json({ token: newToken });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`POST /auth/refresh error: ${message}`);
    res.status(401).json({ error: 'Невалідний токен' });
  }
}
