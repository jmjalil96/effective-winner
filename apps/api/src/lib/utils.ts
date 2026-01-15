import type { Request } from 'express';

/**
 * Extracts common request metadata for service context.
 * Normalizes requestId which may be string or number from pino-http.
 */
export const extractRequestMeta = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
  requestId:
    typeof req.id === 'string' ? req.id : typeof req.id === 'number' ? String(req.id) : null,
});
