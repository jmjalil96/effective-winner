import IORedis from 'ioredis';
import { createChildLogger } from '../../../config/logger.js';
import { env } from '../../../config/env.js';

const connectionLogger = createChildLogger({ module: 'queue:connection' });

const CLOSE_TIMEOUT_MS = 5000;

let connection: IORedis | null = null;

export const getConnection = (): IORedis => {
  if (connection) return connection;

  connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });

  connection.on('connect', () => {
    connectionLogger.info('Redis connected');
  });

  connection.on('error', (err: Error) => {
    connectionLogger.error({ err }, 'Redis error');
  });

  return connection;
};

export const closeConnection = async (): Promise<void> => {
  if (!connection) return;

  const conn = connection;
  connection = null;

  try {
    await Promise.race([
      conn.quit(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Connection close timeout'));
        }, CLOSE_TIMEOUT_MS);
      }),
    ]);
    connectionLogger.info('Redis connection closed');
  } catch (err) {
    connectionLogger.warn({ err }, 'Redis quit timed out, forcing disconnect');
    conn.disconnect();
  }
};

export const setConnection = (c: IORedis | null): void => {
  connection = c;
};
