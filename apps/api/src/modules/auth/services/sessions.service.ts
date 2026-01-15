import { createChildLogger } from '../../../config/logger.js';
import { NotFoundError } from '../../../errors/index.js';
import { logWithContext, AUDIT_ACTIONS, toAuditContext } from '../../../lib/services/index.js';
import type { Session, RevokeAllSessionsResponse } from '@crm/shared';
import {
  findUserSessions,
  findSessionByIdForUser,
  revokeSessionById,
  revokeAllOtherSessions,
} from '../repositories/sessions.repository.js';

const serviceLogger = createChildLogger({ module: 'auth:sessions' });

// =============================================================================
// List Sessions
// =============================================================================

export interface ListSessionsContext {
  userId: string;
  currentSessionId: string;
}

export const listSessions = async (ctx: ListSessionsContext): Promise<Session[]> => {
  const sessions = await findUserSessions(ctx.userId);

  return sessions.map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt.toISOString(),
    lastAccessedAt: s.lastAccessedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    current: s.id === ctx.currentSessionId,
  }));
};

// =============================================================================
// Revoke Session
// =============================================================================

export interface RevokeSessionContext {
  userId: string;
  currentSessionId: string;
  organizationId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const revokeSession = async (
  sessionId: string,
  ctx: RevokeSessionContext
): Promise<void> => {
  const auditCtx = toAuditContext({ ...ctx, actorId: ctx.userId });

  // 1. Cannot revoke current session (use logout instead)
  // Security: Return NotFoundError instead of ForbiddenError to avoid
  // confirming which session ID belongs to the current request.
  if (sessionId === ctx.currentSessionId) {
    throw new NotFoundError('Session not found');
  }

  // 2. Find session (verifies ownership)
  const session = await findSessionByIdForUser(sessionId, ctx.userId);

  if (!session) {
    throw new NotFoundError('Session not found');
  }

  // 3. Revoke
  await revokeSessionById(sessionId);

  // 4. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.SESSION_REVOKE,
    entityType: 'session',
    entityId: sessionId,
  });

  serviceLogger.info(
    { userId: ctx.userId, revokedSessionId: sessionId, requestId: ctx.requestId },
    'Session revoked'
  );
};

// =============================================================================
// Revoke All Other Sessions
// =============================================================================

export interface RevokeAllSessionsContext {
  userId: string;
  currentSessionId: string;
  organizationId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const revokeAllOtherSessionsService = async (
  ctx: RevokeAllSessionsContext
): Promise<RevokeAllSessionsResponse> => {
  const auditCtx = toAuditContext({ ...ctx, actorId: ctx.userId });

  // 1. Revoke all except current
  const revokedCount = await revokeAllOtherSessions(ctx.userId, ctx.currentSessionId);

  // 2. Audit log (only if something was revoked)
  if (revokedCount > 0) {
    logWithContext(auditCtx, {
      action: AUDIT_ACTIONS.SESSION_REVOKE_ALL,
      entityType: 'user',
      entityId: ctx.userId,
      metadata: { revokedCount },
    });

    serviceLogger.info(
      { userId: ctx.userId, revokedCount, requestId: ctx.requestId },
      'All other sessions revoked'
    );
  }

  return { revokedCount };
};
