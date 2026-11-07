import { Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import type { AuthRequest } from '../types/express';
import { jsonError } from '../utils/httpJson';

const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.userId) {
    jsonError(res, req, 401, 'No token, authorization denied');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });
  if (!user || user.role !== 'admin') {
    jsonError(res, req, 403, 'Недостатньо прав');
    return;
  }
  next();
};

export default requireAdmin;
