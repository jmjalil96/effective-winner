import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import {
  users,
  profiles,
  organizations,
  roles,
  rolePermissions,
  permissions,
  sessions,
} from '../../../db/schema.js';

// =============================================================================
// Interfaces
// =============================================================================

export interface UserWithRelations {
  id: string;
  email: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  deletedAt: Date | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    deletedAt: Date | null;
  };
  role: {
    id: string;
    name: string;
  };
  profile: {
    firstName: string;
    lastName: string;
    phone: string | null;
  } | null;
}

// =============================================================================
// User Lookup
// =============================================================================

export const findUserByEmail = async (email: string): Promise<UserWithRelations | null> => {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      emailVerifiedAt: users.emailVerifiedAt,
      isActive: users.isActive,
      failedLoginAttempts: users.failedLoginAttempts,
      lockedUntil: users.lockedUntil,
      deletedAt: users.deletedAt,
      organization: {
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        deletedAt: organizations.deletedAt,
      },
      role: {
        id: roles.id,
        name: roles.name,
      },
      profile: {
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        phone: profiles.phone,
      },
    })
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .leftJoin(profiles, eq(users.id, profiles.userId))
    .where(sql`LOWER(${users.email}) = LOWER(${email})`)
    .limit(1);

  return result[0] ?? null;
};

export const findUserById = async (userId: string): Promise<UserWithRelations | null> => {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      emailVerifiedAt: users.emailVerifiedAt,
      isActive: users.isActive,
      failedLoginAttempts: users.failedLoginAttempts,
      lockedUntil: users.lockedUntil,
      deletedAt: users.deletedAt,
      organization: {
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        deletedAt: organizations.deletedAt,
      },
      role: {
        id: roles.id,
        name: roles.name,
      },
      profile: {
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        phone: profiles.phone,
      },
    })
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .leftJoin(profiles, eq(users.id, profiles.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0] ?? null;
};

export const getUserPermissions = async (roleId: string): Promise<string[]> => {
  const result = await db
    .select({ name: permissions.name })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));

  return result.map((r) => r.name);
};

// =============================================================================
// Login State Management
// =============================================================================

export const incrementFailedAttempts = async (
  userId: string,
  lockUntil: Date | null
): Promise<void> => {
  await db
    .update(users)
    .set({
      failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`,
      lockedUntil: lockUntil,
    })
    .where(eq(users.id, userId));
};

/**
 * Atomically reset login state and create session.
 * Both operations must succeed or both fail.
 */
export const resetLoginStateAndCreateSession = async (params: {
  userId: string;
  sidHash: string;
  organizationId: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> => {
  await db.transaction(async (tx) => {
    // Reset failed attempts and update last login
    await tx
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, params.userId));

    // Create session
    await tx.insert(sessions).values({
      sidHash: params.sidHash,
      userId: params.userId,
      organizationId: params.organizationId,
      data: {},
      expiresAt: params.expiresAt,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  });
};

// =============================================================================
// Update Profile
// =============================================================================

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export interface UpdatedProfile {
  firstName: string;
  lastName: string;
  phone: string | null;
}

/**
 * Update user profile. Creates profile if it doesn't exist.
 */
export const updateUserProfile = async (
  userId: string,
  data: UpdateProfileData
): Promise<UpdatedProfile> => {
  // Check if profile exists
  const existing = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (existing.length === 0) {
    // Create profile with provided data
    const result = await db
      .insert(profiles)
      .values({
        userId,
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        phone: data.phone ?? null,
      })
      .returning({
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        phone: profiles.phone,
      });

    const profile = result[0];
    if (!profile) throw new Error('Failed to create profile');
    return profile;
  }

  // Build update data (only include fields that are provided)
  const updateData: Record<string, string | null> = {};
  if (data.firstName !== undefined) updateData['firstName'] = data.firstName;
  if (data.lastName !== undefined) updateData['lastName'] = data.lastName;
  if (data.phone !== undefined) updateData['phone'] = data.phone;

  if (Object.keys(updateData).length === 0) {
    // Nothing to update, fetch current
    const current = await db
      .select({
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        phone: profiles.phone,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    const profile = current[0];
    if (!profile) throw new Error('Profile not found');
    return profile;
  }

  const result = await db
    .update(profiles)
    .set(updateData)
    .where(eq(profiles.userId, userId))
    .returning({
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      phone: profiles.phone,
    });

  const profile = result[0];
  if (!profile) throw new Error('Failed to update profile');
  return profile;
};
