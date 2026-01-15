import type { Request } from 'express';
import { db } from '../../db/index.js';
import { auditLogs } from '../../db/schema/index.js';
import { createChildLogger } from '../../config/logger.js';

const auditLogger = createChildLogger({ module: 'audit' });

// =============================================================================
// 5. Type-safe action constants
// =============================================================================

export const AUDIT_ACTIONS = {
  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_LOGIN_FAILED: 'auth:login_failed',
  AUTH_PASSWORD_RESET_REQUEST: 'auth:password_reset_request',
  AUTH_PASSWORD_RESET_COMPLETE: 'auth:password_reset_complete',
  AUTH_PASSWORD_CHANGE: 'auth:password_change',
  AUTH_EMAIL_VERIFY: 'auth:email_verify',
  AUTH_EMAIL_VERIFY_RESEND: 'auth:email_verify_resend',

  // User
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_ACTIVATE: 'user:activate',
  USER_DEACTIVATE: 'user:deactivate',

  // Organization
  ORG_CREATE: 'organization:create',
  ORG_UPDATE: 'organization:update',
  ORG_SETTINGS_UPDATE: 'organization:settings_update',

  // Role
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  ROLE_PERMISSION_GRANT: 'role:permission_grant',
  ROLE_PERMISSION_REVOKE: 'role:permission_revoke',

  // Invitation
  INVITATION_CREATE: 'invitation:create',
  INVITATION_ACCEPT: 'invitation:accept',
  INVITATION_REVOKE: 'invitation:revoke',

  // Session
  SESSION_CREATE: 'session:create',
  SESSION_REVOKE: 'session:revoke',
  SESSION_REVOKE_ALL: 'session:revoke_all',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// =============================================================================
// Types
// =============================================================================

export interface AuditContext {
  organizationId?: string | null;
  actorId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Converts a service context to AuditContext.
 * Use this to avoid manually building AuditContext in every service function.
 */
export const toAuditContext = (ctx: {
  organizationId?: string | null;
  actorId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}): AuditContext => ({
  organizationId: ctx.organizationId ?? null,
  actorId: ctx.actorId ?? null,
  ipAddress: ctx.ipAddress ?? null,
  userAgent: ctx.userAgent ?? null,
  requestId: ctx.requestId ?? null,
});

export interface AuditEntry {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  changes?: { before?: unknown; after?: unknown };
  metadata?: Record<string, unknown>;
}

// =============================================================================
// 3. Sensitive field redaction
// =============================================================================

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'credentials',
  'bearer',
  'cookie',
  'creditcard',
  'credit_card',
  'ssn',
  'cvv',
  'privatekey',
  'private_key',
]);

const SENSITIVE_PATTERNS = ['password', 'token', 'secret', 'credential', 'auth'];

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 10;

const isSensitiveKey = (key: string): boolean => {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.has(lowerKey) || SENSITIVE_PATTERNS.some((p) => lowerKey.includes(p));
};

const redactSensitive = (obj: unknown, depth = 0, seen = new WeakSet()): unknown => {
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (seen.has(obj)) return '[CIRCULAR]';
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item, depth + 1, seen));
  }

  if (obj instanceof Date) return obj;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = redactSensitive(value, depth + 1, seen);
    }
  }
  return result;
};

// =============================================================================
// 2. Context extractor from Express Request
// =============================================================================

export const extractAuditContext = (req: Request): AuditContext => {
  // Use req.ip directly - Express handles x-forwarded-for parsing when trust proxy is configured
  const session = (req as Request & { session?: { userId?: string; organizationId?: string } })
    .session;

  return {
    organizationId: session?.organizationId ?? null,
    actorId: session?.userId ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    requestId:
      typeof req.id === 'string' ? req.id : typeof req.id === 'number' ? String(req.id) : null,
  };
};

// =============================================================================
// 4. Fire-and-forget write with error logging
// =============================================================================

const writeAuditLog = async (entry: AuditEntry, ctx: AuditContext): Promise<void> => {
  const changes = entry.changes ? redactSensitive(entry.changes) : null;
  const metadata = entry.metadata ? redactSensitive(entry.metadata) : null;

  await db.insert(auditLogs).values({
    organizationId: ctx.organizationId ?? undefined,
    actorId: ctx.actorId ?? undefined,
    action: entry.action,
    entityType: entry.entityType ?? undefined,
    entityId: entry.entityId ?? undefined,
    changes,
    metadata,
    ipAddress: ctx.ipAddress ?? undefined,
    userAgent: ctx.userAgent ?? undefined,
    requestId: ctx.requestId ?? undefined,
  });
};

// =============================================================================
// 1. Core log functions
// =============================================================================

/**
 * Fire-and-forget audit log with request context extraction.
 * Never throws - errors are logged internally.
 */
export const log = (req: Request, entry: AuditEntry): void => {
  const ctx = extractAuditContext(req);
  writeAuditLog(entry, ctx).catch((err: unknown) => {
    auditLogger.error(
      { err, action: entry.action, entityType: entry.entityType },
      'Failed to write audit log'
    );
  });
};

/**
 * Awaitable audit log with request context extraction.
 * Errors are logged but NOT re-thrown (audit should never fail requests).
 */
export const logAsync = async (req: Request, entry: AuditEntry): Promise<void> => {
  const ctx = extractAuditContext(req);
  try {
    await writeAuditLog(entry, ctx);
  } catch (err: unknown) {
    auditLogger.error(
      { err, action: entry.action, entityType: entry.entityType },
      'Failed to write audit log'
    );
  }
};

/**
 * Fire-and-forget audit log with manual context (for background jobs/system actions).
 */
export const logWithContext = (ctx: AuditContext, entry: AuditEntry): void => {
  writeAuditLog(entry, ctx).catch((err: unknown) => {
    auditLogger.error(
      { err, action: entry.action, entityType: entry.entityType },
      'Failed to write audit log'
    );
  });
};

/**
 * Awaitable audit log with manual context.
 */
export const logWithContextAsync = async (ctx: AuditContext, entry: AuditEntry): Promise<void> => {
  try {
    await writeAuditLog(entry, ctx);
  } catch (err: unknown) {
    auditLogger.error(
      { err, action: entry.action, entityType: entry.entityType },
      'Failed to write audit log'
    );
  }
};
