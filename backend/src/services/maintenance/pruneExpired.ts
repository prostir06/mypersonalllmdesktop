import prisma from '../../config/prisma';
import logger from '../../logger';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export type PruneResult = {
  refreshTokens: number;
  toolActions: number;
};

/** Delete refresh tokens and pending tool actions whose expires_at is in the past. */
export async function pruneExpired(now = new Date()): Promise<PruneResult> {
  const [refreshTokens, toolActions] = await Promise.all([
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.pendingToolAction.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return {
    refreshTokens: refreshTokens.count,
    toolActions: toolActions.count,
  };
}

export function maintenanceIntervalMs(): number {
  const n = parseInt(process.env.MAINTENANCE_INTERVAL_MS || '', 10);
  return Number.isFinite(n) && n >= 60_000 ? n : DEFAULT_INTERVAL_MS;
}

export function startMaintenance(
  run: (now?: Date) => Promise<PruneResult> = pruneExpired,
  intervalMs = maintenanceIntervalMs()
): () => void {
  const tick = () => {
    void run()
      .then((result) => {
        if (result.refreshTokens || result.toolActions) {
          logger.info(
            `Maintenance prune: refreshTokens=${result.refreshTokens} toolActions=${result.toolActions}`
          );
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Maintenance prune skipped: ${message}`);
      });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}
