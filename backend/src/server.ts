import 'dotenv/config';
import app from './app';
import logger from './logger';
import prisma from './config/prisma';
import { runShutdown } from './shutdown';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Server cannot start without it.');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    void import('./services/documents/bootRequeue')
      .then(({ requeueOrFailStaleOnBoot }) => requeueOrFailStaleOnBoot())
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`Boot document requeue skipped: ${message}`);
      });
  });

  const stop = (signal: NodeJS.Signals) => {
    logger.info(`Received ${signal}, shutting down`);
    void runShutdown({
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
      disconnect: () => prisma.$disconnect(),
      timeoutMs: 25_000,
    })
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Shutdown failed: ${message}`);
        process.exit(1);
      });
  };

  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));

  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    logger.error(`unhandledRejection: ${message}`);
  });
  process.on('uncaughtException', (err: Error) => {
    logger.error(`uncaughtException: ${err.message}`);
    stop('SIGTERM');
  });
}

export default app;
