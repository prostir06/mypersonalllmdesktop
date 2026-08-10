import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createAdapter(): PrismaPg {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const maxRaw = process.env.DB_POOL_MAX;
  const max = maxRaw ? Number.parseInt(maxRaw, 10) : 10;

  if (Number.isFinite(max) && max > 0) {
    const pool = new pg.Pool({
      connectionString,
      max,
      idleTimeoutMillis: 30_000,
    });
    return new PrismaPg(pool);
  }

  return new PrismaPg({ connectionString });
}

const adapter = createAdapter();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    adapter,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
