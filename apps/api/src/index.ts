import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { app } from './app.js';
import { closeDb } from './db/index.js';
import { closeTransport, closeQueue, initEmailWorker } from './lib/services/index.js';

const SHUTDOWN_TIMEOUT = 10_000;

const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ host: '0.0.0.0', port: env.PORT }, 'Server running');

  if (env.NODE_ENV !== 'test') {
    initEmailWorker().catch((err: unknown) => {
      logger.error({ err }, 'Failed to initialize email worker');
    });
  }
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');

  const forceExit = setTimeout(() => {
    logger.error({ timeoutMs: SHUTDOWN_TIMEOUT }, 'Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    logger.info('HTTP server closed');

    await closeQueue();
    logger.info('Queue service closed');

    await closeDb();
    logger.info('Database connection closed');

    closeTransport();

    clearTimeout(forceExit);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    clearTimeout(forceExit);
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
