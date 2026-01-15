import { eq, and, isNull, ne, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import {
  users,
  profiles,
  organizations,
  sessions,
  passwordResetTokens,
} from '../../../db/schema/index.js';

// =============================================================================
// Password Reset - Interfaces
// =============================================================================

export interface UserForPasswordReset {
  id: string;
  email: string;
  passwordHash: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  organization: {
    id: string;
    name: string;
    deletedAt: Date | null;
  };
  profile: {
    firstName: string;
  } | null;
}

export interface ResetTokenWithUser {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  user: {
    id: string;
    email: string;
    isActive: boolean;
    deletedAt: Date | null;
    organization: {
      id: string;
      name: string;
      deletedAt: Date | null;
    };
    profile: {
      firstName: string;
    } | null;
  };
}

// =============================================================================
// Password Reset - Queries
// =============================================================================

export const findUserForPasswordReset = async (
  email: string
): Promise<UserForPasswordReset | null> => {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
      organization: {
        id: organizations.id,
        name: organizations.name,
        deletedAt: organizations.deletedAt,
      },
      profile: {
        firstName: profiles.firstName,
      },
    })
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .leftJoin(profiles, eq(users.id, profiles.userId))
    .where(sql`LOWER(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  return result[0] ?? null;
};

export const createPasswordResetToken = async (params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> => {
  await db.transaction(async (tx) => {
    // Invalidate existing tokens for this user
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, params.userId));

    // Create new token
    await tx.insert(passwordResetTokens).values({
      userId: params.userId,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
    });
  });
};

export const findValidResetToken = async (
  tokenHash: string
): Promise<ResetTokenWithUser | null> => {
  const result = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
      userId2: users.id,
      userEmail: users.email,
      userIsActive: users.isActive,
      userDeletedAt: users.deletedAt,
      orgId: organizations.id,
      orgName: organizations.name,
      orgDeletedAt: organizations.deletedAt,
      profileFirstName: profiles.firstName,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(passwordResetTokens.userId, users.id))
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .leftJoin(profiles, eq(users.id, profiles.userId))
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    user: {
      id: row.userId2,
      email: row.userEmail,
      isActive: row.userIsActive,
      deletedAt: row.userDeletedAt,
      organization: {
        id: row.orgId,
        name: row.orgName,
        deletedAt: row.orgDeletedAt,
      },
      profile: row.profileFirstName ? { firstName: row.profileFirstName } : null,
    },
  };
};

/**
 * Atomically execute password reset:
 * 1. Mark token as used (only if not already used - prevents race condition)
 * 2. Update password hash
 * 3. Delete all user sessions
 *
 * Returns false if token was already used (concurrent reset detected).
 */
export const executePasswordReset = async (params: {
  tokenId: string;
  userId: string;
  passwordHash: string;
}): Promise<boolean> => {
  return await db.transaction(async (tx) => {
    // Atomic: only mark used if not already used
    const updated = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.id, params.tokenId), isNull(passwordResetTokens.usedAt)))
      .returning({ id: passwordResetTokens.id });

    // Token was already used (concurrent reset)
    if (updated.length === 0) {
      return false;
    }

    // Update password
    await tx
      .update(users)
      .set({ passwordHash: params.passwordHash })
      .where(eq(users.id, params.userId));

    // Invalidate all sessions
    await tx.delete(sessions).where(eq(sessions.userId, params.userId));

    return true;
  });
};

// =============================================================================
// Change Password - Interfaces
// =============================================================================

export interface UserForPasswordChange {
  passwordHash: string | null;
  email: string;
  organizationName: string;
  firstName: string | null;
}

// =============================================================================
// Change Password - Queries
// =============================================================================

export const getUserForPasswordChange = async (
  userId: string
): Promise<UserForPasswordChange | null> => {
  const result = await db
    .select({
      passwordHash: users.passwordHash,
      email: users.email,
      organizationName: organizations.name,
      firstName: profiles.firstName,
    })
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .leftJoin(profiles, eq(users.id, profiles.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0] ?? null;
};

/**
 * Atomically change password and revoke other sessions.
 * 1. Update passwordHash
 * 2. Update passwordChangedAt
 * 3. Revoke all sessions EXCEPT current (soft-revoke via revokedAt)
 */
export const executeChangePassword = async (params: {
  userId: string;
  passwordHash: string;
  currentSessionId: string;
}): Promise<void> => {
  await db.transaction(async (tx) => {
    // Update password and timestamp
    await tx
      .update(users)
      .set({
        passwordHash: params.passwordHash,
        passwordChangedAt: new Date(),
      })
      .where(eq(users.id, params.userId));

    // Soft-revoke all OTHER sessions (not the current one)
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, params.userId),
          ne(sessions.id, params.currentSessionId),
          isNull(sessions.revokedAt)
        )
      );
  });
};
