import pino from 'pino';
import { randomUUID } from 'crypto';
import { env } from './env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: [
    'password',
    'passwordHash',
    'token',
    'authorization',
    'req.headers.authorization',
  ],
  transport:
    env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export const genReqId = (req: { headers: Record<string, string | undefined> }) =>
  req.headers['x-request-id'] ?? randomUUID();

export const createChildLogger = (bindings: pino.Bindings) =>
  logger.child(bindings);
