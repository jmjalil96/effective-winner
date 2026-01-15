import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ValidationError, UnauthorizedError, ForbiddenError } from '../errors/index.js';
import { createChildLogger } from '../config/logger.js';
import { hashSessionId, findSessionWithContext, deleteSession, touchSession } from './session.js';

// Only update lastAccessedAt if > 5 minutes since last access
const SESSION_TOUCH_THRESHOLD_MS = 5 * 60 * 1000;

const authLogger = createChildLogger({ module: 'auth:middleware' });

interface ValidateOptions {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

const parseOrThrow = (schema: ZodType, data: unknown): unknown => {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  throw new ValidationError('Validation failed', details);
};

export const validate = (schemas: ValidateOptions): RequestHandler => {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = parseOrThrow(schemas.body, req.body);
      }
      if (schemas.query) {
        req.query = parseOrThrow(schemas.query, req.query) as typeof req.query;
      }
      if (schemas.params) {
        req.params = parseOrThrow(schemas.params, req.params) as typeof req.params;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const cookies = req.cookies as Record<string, string> | undefined;
    const sid = cookies?.['sid'];
    if (!sid) {
      throw new UnauthorizedError('Authentication required');
    }

    const sidHash = hashSessionId(sid);
    const data = await findSessionWithContext(sidHash);

    if (!data) {
      throw new UnauthorizedError('Authentication required');
    }

    const { session, user, organization, role, permissions } = data;

    // Session revoked
    if (session.revokedAt) {
      throw new UnauthorizedError('Session revoked');
    }

    // Session expired - fire-and-forget cleanup
    if (session.expiresAt < new Date()) {
      deleteSession(session.id).catch((err: unknown) => {
        authLogger.error({ err, sessionId: session.id }, 'Failed to delete expired session');
      });
      throw new UnauthorizedError('Session expired');
    }

    // User/org validity
    if (user.deletedAt || organization.deletedAt) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!user.isActive) {
      throw new ForbiddenError('Account deactivated');
    }

    // Throttled touch: update lastAccessedAt if stale
    if (Date.now() - session.lastAccessedAt.getTime() > SESSION_TOUCH_THRESHOLD_MS) {
      touchSession(session.id).catch((err: unknown) => {
        authLogger.warn({ err, sessionId: session.id }, 'Failed to touch session');
      });
    }

    // Attach context
    req.ctx = {
      user: { id: user.id, email: user.email },
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
      role: { id: role.id, name: role.name },
      permissions,
      session: { id: session.id, expiresAt: session.expiresAt },
    };

    next();
  } catch (err) {
    next(err);
  }
};

export const requirePermission = (permission: string): RequestHandler => {
  return (req, _res, next) => {
    if (!req.ctx) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!req.ctx.permissions.includes(permission)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
};

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  try {
    const cookies = req.cookies as Record<string, string> | undefined;
    const sid = cookies?.['sid'];
    if (!sid) {
      next();
      return;
    }

    const sidHash = hashSessionId(sid);
    const data = await findSessionWithContext(sidHash);

    if (!data) {
      next();
      return;
    }

    const { session, user, organization, role, permissions } = data;

    // Skip invalid sessions silently
    if (
      session.revokedAt ||
      session.expiresAt < new Date() ||
      user.deletedAt ||
      !user.isActive ||
      organization.deletedAt
    ) {
      next();
      return;
    }

    req.ctx = {
      user: { id: user.id, email: user.email },
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
      role: { id: role.id, name: role.name },
      permissions,
      session: { id: session.id, expiresAt: session.expiresAt },
    };

    next();
  } catch (err) {
    authLogger.warn({ err }, 'Optional auth check failed');
    next();
  }
};
