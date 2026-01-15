import { eq, and, isNull, ne, gt } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { sessions } from '../../../db/schema.js';

// =============================================================================
// Interfaces
// =============================================================================

export interface SessionForList {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Find all active (non-revoked, non-expired) sessions for a user.
 */
export const findUserSessions = async (userId: string): Promise<SessionForList[]> => {
  const result = await db
    .select({
      id: sessions.id,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastAccessedAt: sessions.lastAccessedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date())
      )
    )
    .orderBy(sessions.lastAccessedAt);

  return result;
};

/**
 * Find session by ID, verifying it belongs to the user.
 * Returns null if not found, already revoked, expired, or wrong user.
 */
export const findSessionByIdForUser = async (
  sessionId: string,
  userId: string
): Promise<{ id: string } | null> => {
  const result = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .limit(1);

  return result[0] ?? null;
};

/**
 * Soft-revoke a session by setting revokedAt.
 */
export const revokeSessionById = async (sessionId: string): Promise<void> => {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
};

/**
 * Soft-revoke all sessions for a user EXCEPT the current one.
 * Returns count of revoked sessions.
 */
export const revokeAllOtherSessions = async (
  userId: string,
  currentSessionId: string
): Promise<number> => {
  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        ne(sessions.id, currentSessionId),
        isNull(sessions.revokedAt)
      )
    )
    .returning({ id: sessions.id });

  return result.length;
};
