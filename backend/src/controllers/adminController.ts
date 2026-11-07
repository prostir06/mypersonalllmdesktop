import { Response } from 'express';
import { jsonError } from '../utils/httpJson';
import type { AuthRequest } from '../types/express';
import { AdminError, listDirectory, spendReport, updateDirectoryUser } from '../services/admin/directory';
import { createInvite, listInvites } from '../services/admin/invites';

function fail(req: AuthRequest, res: Response, error: unknown, fallback: string): void {
  if (error instanceof AdminError) {
    jsonError(res, req, error.statusCode, error.message);
    return;
  }
  jsonError(res, req, 500, fallback);
}

export async function getUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({ users: await listDirectory() });
  } catch (error: unknown) {
    fail(req, res, error, 'Не вдалося завантажити користувачів');
  }
}

export async function patchUser(req: AuthRequest, res: Response): Promise<void> {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    jsonError(res, req, 400, 'Некоректний користувач');
    return;
  }
  const body = req.body as {
    role?: unknown;
    blocked?: unknown;
    sharedKeyDailyLimitUsd?: unknown;
  };
  const role = body.role === 'admin' || body.role === 'member' ? body.role : undefined;
  if (body.role !== undefined && !role) {
    jsonError(res, req, 400, 'Некоректна роль');
    return;
  }
  const blocked = typeof body.blocked === 'boolean' ? body.blocked : undefined;
  let sharedKeyDailyLimitUsd: number | null | undefined;
  if (body.sharedKeyDailyLimitUsd === null) sharedKeyDailyLimitUsd = null;
  else if (body.sharedKeyDailyLimitUsd !== undefined) {
    const amount = Number(body.sharedKeyDailyLimitUsd);
    if (!Number.isFinite(amount) || amount < 0) {
      jsonError(res, req, 400, 'Некоректний денний ліміт');
      return;
    }
    sharedKeyDailyLimitUsd = amount;
  }

  try {
    const user = await updateDirectoryUser(req.userId!, userId, {
      role,
      blocked,
      sharedKeyDailyLimitUsd,
    });
    res.json({ user });
  } catch (error: unknown) {
    fail(req, res, error, 'Не вдалося оновити користувача');
  }
}

export async function getSpend(req: AuthRequest, res: Response): Promise<void> {
  const period = req.query.period === 'month' ? 'month' : 'day';
  try {
    res.json(await spendReport(period));
  } catch (error: unknown) {
    fail(req, res, error, 'Не вдалося порахувати витрату');
  }
}

export async function postInvite(req: AuthRequest, res: Response): Promise<void> {
  const ttlHours = Number((req.body as { ttlHours?: unknown })?.ttlHours);
  try {
    const invite = await createInvite(req.userId!, Number.isFinite(ttlHours) ? ttlHours : undefined);
    res.status(201).json(invite);
  } catch (error: unknown) {
    fail(req, res, error, 'Не вдалося створити запрошення');
  }
}

export async function getInvites(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({ invites: await listInvites() });
  } catch (error: unknown) {
    fail(req, res, error, 'Не вдалося завантажити запрошення');
  }
}
