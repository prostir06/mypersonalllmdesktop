import prisma from '../config/prisma';
import logger from '../logger';
import { adminEmail } from './roles';

export async function ensureBootstrapAdmin(): Promise<void> {
  const email = adminEmail();
  if (email) {
    const match = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!match) return;
    await prisma.user.update({ where: { id: match.id }, data: { role: 'admin' } });
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: 'admin' },
    select: { id: true },
  });
  if (admin) return;

  const first = await prisma.user.findFirst({
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (!first) return;
  await prisma.user.update({ where: { id: first.id }, data: { role: 'admin' } });
}

export function bootBootstrapAdmin(): void {
  void ensureBootstrapAdmin().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Bootstrap admin skipped: ${message}`);
  });
}
