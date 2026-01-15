import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import {
  users,
  profiles,
  organizations,
  roles,
  rolePermissions,
  permissions,
  emailVerificationTokens,
} from '../../../db/schema/index.js';

// =============================================================================
// Email Existence Check
// =============================================================================

export const checkEmailExists = async (email: string): Promise<boolean> => {
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`LOWER(${users.email}) = ${email.toLowerCase()}`, isNull(users.deletedAt)))
    .limit(1);
  return result.length > 0;
};

export const checkSlugExists = async (slug: string): Promise<boolean> => {
  const result = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return result.length > 0;
};

// =============================================================================
// Organization Creation
// =============================================================================

export interface CreateOrganizationWithAdminParams {
  organization: { name: string; slug: string };
  user: { email: string; passwordHash: string };
  profile: { firstName: string; lastName: string };
}

export interface CreateOrganizationWithAdminResult {
  organizationId: string;
  userId: string;
  roleId: string;
}

/**
 * Atomically create organization with admin user:
 * 1. Create organization
 * 2. Create Admin role (isDefault: true)
 * 3. Link all permissions to Admin role
 * 4. Create user (emailVerifiedAt: null)
 * 5. Create profile
 */
export const createOrganizationWithAdmin = async (
  params: CreateOrganizationWithAdminParams
): Promise<CreateOrganizationWithAdminResult> => {
  return await db.transaction(async (tx) => {
    // 1. Create organization
    const orgResult = await tx
      .insert(organizations)
      .values({
        name: params.organization.name,
        slug: params.organization.slug,
      })
      .returning({ id: organizations.id });

    const org = orgResult[0];
    if (!org) throw new Error('Failed to create organization');

    // 2. Create Admin role
    const roleResult = await tx
      .insert(roles)
      .values({
        organizationId: org.id,
        name: 'Admin',
        description: 'Organization administrator with full access',
        isDefault: true,
      })
      .returning({ id: roles.id });

    const role = roleResult[0];
    if (!role) throw new Error('Failed to create role');

    // 3. Link all permissions to Admin role
    const allPermissions = await tx.select({ id: permissions.id }).from(permissions);

    if (allPermissions.length > 0) {
      await tx.insert(rolePermissions).values(
        allPermissions.map((p) => ({
          roleId: role.id,
          permissionId: p.id,
        }))
      );
    }

    // 4. Create user (emailVerifiedAt: null - not verified yet)
    const userResult = await tx
      .insert(users)
      .values({
        organizationId: org.id,
        roleId: role.id,
        email: params.user.email,
        passwordHash: params.user.passwordHash,
        emailVerifiedAt: null,
        isActive: true,
      })
      .returning({ id: users.id });

    const user = userResult[0];
    if (!user) throw new Error('Failed to create user');

    // 5. Create profile
    await tx.insert(profiles).values({
      userId: user.id,
      firstName: params.profile.firstName,
      lastName: params.profile.lastName,
    });

    return {
      organizationId: org.id,
      userId: user.id,
      roleId: role.id,
    };
  });
};

// =============================================================================
// Email Verification Token
// =============================================================================

/**
 * Create email verification token (invalidates existing tokens first).
 */
export const createEmailVerificationToken = async (params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> => {
  await db.transaction(async (tx) => {
    // Invalidate existing tokens for this user
    await tx
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, params.userId));

    // Create new token
    await tx.insert(emailVerificationTokens).values({
      userId: params.userId,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
    });
  });
};

// =============================================================================
// Email Verification
// =============================================================================

export interface EmailVerificationTokenWithUser {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  user: {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    isActive: boolean;
    deletedAt: Date | null;
    organization: {
      id: string;
      name: string;
      deletedAt: Date | null;
    };
  };
}

export const findValidEmailVerificationToken = async (
  tokenHash: string
): Promise<EmailVerificationTokenWithUser | null> => {
  const result = await db
    .select({
      id: emailVerificationTokens.id,
      userId: emailVerificationTokens.userId,
      expiresAt: emailVerificationTokens.expiresAt,
      usedAt: emailVerificationTokens.usedAt,
      userId2: users.id,
      userEmail: users.email,
      userEmailVerifiedAt: users.emailVerifiedAt,
      userIsActive: users.isActive,
      userDeletedAt: users.deletedAt,
      orgId: organizations.id,
      orgName: organizations.name,
      orgDeletedAt: organizations.deletedAt,
    })
    .from(emailVerificationTokens)
    .innerJoin(users, eq(emailVerificationTokens.userId, users.id))
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
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
      emailVerifiedAt: row.userEmailVerifiedAt,
      isActive: row.userIsActive,
      deletedAt: row.userDeletedAt,
      organization: {
        id: row.orgId,
        name: row.orgName,
        deletedAt: row.orgDeletedAt,
      },
    },
  };
};

/**
 * Atomically execute email verification:
 * 1. Mark token as used (only if not already used - prevents race condition)
 * 2. Set user's emailVerifiedAt
 *
 * Returns false if token was already used (concurrent verification detected).
 */
export const executeEmailVerification = async (params: {
  tokenId: string;
  userId: string;
}): Promise<boolean> => {
  return await db.transaction(async (tx) => {
    // Atomic: only mark used if not already used
    const updated = await tx
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(
        and(eq(emailVerificationTokens.id, params.tokenId), isNull(emailVerificationTokens.usedAt))
      )
      .returning({ id: emailVerificationTokens.id });

    // Token was already used (concurrent verification)
    if (updated.length === 0) {
      return false;
    }

    // Set emailVerifiedAt
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, params.userId));

    return true;
  });
};

// =============================================================================
// Resend Verification
// =============================================================================

export interface UserForResendVerification {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
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

export const findUserForResendVerification = async (
  email: string
): Promise<UserForResendVerification | null> => {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
      orgId: organizations.id,
      orgName: organizations.name,
      orgDeletedAt: organizations.deletedAt,
      profileFirstName: profiles.firstName,
    })
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .leftJoin(profiles, eq(users.id, profiles.userId))
    .where(sql`LOWER(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    isActive: row.isActive,
    deletedAt: row.deletedAt,
    organization: {
      id: row.orgId,
      name: row.orgName,
      deletedAt: row.orgDeletedAt,
    },
    profile: row.profileFirstName ? { firstName: row.profileFirstName } : null,
  };
};
