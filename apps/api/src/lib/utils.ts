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

/**
 * Extracts validated request data set by the validate middleware.
 * Throws if validation middleware hasn't run (should never happen in properly configured routes).
 */
export const getValidated = (req: Request) => {
  if (!req.validated) {
    throw new Error('Validation middleware not applied to this route');
  }
  return req.validated;
};
