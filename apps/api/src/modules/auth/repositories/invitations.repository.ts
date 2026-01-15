import { eq, and, isNull, gt, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { users, profiles, organizations, roles, invitations } from '../../../db/schema/index.js';

// =============================================================================
// Role Lookup
// =============================================================================

export interface RoleForInvitation {
  id: string;
  name: string;
  organizationId: string;
  isDefault: boolean;
}

export const findRoleById = async (roleId: string): Promise<RoleForInvitation | null> => {
  const result = await db
    .select({
      id: roles.id,
      name: roles.name,
      organizationId: roles.organizationId,
      isDefault: roles.isDefault,
    })
    .from(roles)
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)))
    .limit(1);

  return result[0] ?? null;
};

// =============================================================================
// Invitation Checks
// =============================================================================

export const checkPendingInvitation = async (
  organizationId: string,
  email: string
): Promise<boolean> => {
  const result = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        sql`LOWER(${invitations.email}) = LOWER(${email})`,
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date())
      )
    )
    .limit(1);
  return result.length > 0;
};

// =============================================================================
// Create Invitation
// =============================================================================

export interface CreateInvitationParams {
  organizationId: string;
  email: string;
  roleId: string;
  invitedById: string;
  tokenHash: string;
  expiresAt: Date;
}

export const createInvitation = async (params: CreateInvitationParams): Promise<{ id: string }> => {
  const result = await db
    .insert(invitations)
    .values({
      organizationId: params.organizationId,
      email: params.email,
      roleId: params.roleId,
      invitedById: params.invitedById,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
    })
    .returning({ id: invitations.id });

  const invitation = result[0];
  if (!invitation) throw new Error('Failed to create invitation');

  return { id: invitation.id };
};

// =============================================================================
// Find Invitation
// =============================================================================

export interface InvitationWithRelations {
  id: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
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
  invitedBy: {
    id: string;
    firstName: string | null;
  };
}

export const findValidInvitationByToken = async (
  tokenHash: string
): Promise<InvitationWithRelations | null> => {
  const result = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      tokenHash: invitations.tokenHash,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      orgDeletedAt: organizations.deletedAt,
      roleId: roles.id,
      roleName: roles.name,
      invitedById: users.id,
      invitedByFirstName: profiles.firstName,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
    .innerJoin(
      roles,
      and(
        eq(invitations.roleId, roles.id),
        eq(roles.organizationId, invitations.organizationId),
        isNull(roles.deletedAt)
      )
    )
    .innerJoin(users, eq(invitations.invitedById, users.id))
    .leftJoin(profiles, eq(users.id, profiles.userId))
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
    organization: {
      id: row.orgId,
      name: row.orgName,
      slug: row.orgSlug,
      deletedAt: row.orgDeletedAt,
    },
    role: {
      id: row.roleId,
      name: row.roleName,
    },
    invitedBy: {
      id: row.invitedById,
      firstName: row.invitedByFirstName,
    },
  };
};

// =============================================================================
// Accept Invitation
// =============================================================================

export interface AcceptInvitationParams {
  invitationId: string;
  organizationId: string;
  roleId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
}

/**
 * Atomically accept invitation:
 * 1. Mark invitation as accepted (only if not already accepted - prevents race)
 * 2. Create user with emailVerifiedAt = now (auto-verified via email link)
 * 3. Create profile
 *
 * Returns null if invitation was already accepted (concurrent accept detected).
 */
export const executeAcceptInvitation = async (
  params: AcceptInvitationParams
): Promise<{ userId: string } | null> => {
  return await db.transaction(async (tx) => {
    // Atomic: only mark accepted if not already accepted
    const updated = await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invitations.id, params.invitationId), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });

    // Invitation was already accepted (concurrent accept)
    if (updated.length === 0) {
      return null;
    }

    // Create user with emailVerifiedAt = now (user clicked email link = verified)
    const userResult = await tx
      .insert(users)
      .values({
        organizationId: params.organizationId,
        roleId: params.roleId,
        email: params.email,
        passwordHash: params.passwordHash,
        emailVerifiedAt: new Date(),
        isActive: true,
      })
      .returning({ id: users.id });

    const user = userResult[0];
    if (!user) throw new Error('Failed to create user');

    // Create profile
    await tx.insert(profiles).values({
      userId: user.id,
      firstName: params.firstName,
      lastName: params.lastName,
    });

    return { userId: user.id };
  });
};

// =============================================================================
// Inviter Info
// =============================================================================

export interface InviterInfo {
  firstName: string | null;
}

export const getInviterInfo = async (userId: string): Promise<InviterInfo | null> => {
  const result = await db
    .select({
      firstName: profiles.firstName,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  return result[0] ?? null;
};

// =============================================================================
// List Pending Invitations
// =============================================================================

export interface PendingInvitation {
  id: string;
  email: string;
  role: {
    id: string;
    name: string;
  };
  invitedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  expiresAt: Date;
  createdAt: Date;
}

export const findPendingInvitations = async (
  organizationId: string
): Promise<PendingInvitation[]> => {
  const result = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      roleId: roles.id,
      roleName: roles.name,
      invitedById: users.id,
      invitedByFirstName: profiles.firstName,
      invitedByLastName: profiles.lastName,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .innerJoin(roles, eq(invitations.roleId, roles.id))
    .innerJoin(users, eq(invitations.invitedById, users.id))
    .leftJoin(profiles, eq(users.id, profiles.userId))
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date())
      )
    )
    .orderBy(invitations.createdAt);

  return result.map((row) => ({
    id: row.id,
    email: row.email,
    role: {
      id: row.roleId,
      name: row.roleName,
    },
    invitedBy: {
      id: row.invitedById,
      firstName: row.invitedByFirstName ?? '',
      lastName: row.invitedByLastName ?? '',
    },
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }));
};

// =============================================================================
// Revoke Invitation
// =============================================================================

export interface InvitationForRevoke {
  id: string;
  organizationId: string;
  email: string;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}

export const findInvitationById = async (
  invitationId: string
): Promise<InvitationForRevoke | null> => {
  const result = await db
    .select({
      id: invitations.id,
      organizationId: invitations.organizationId,
      email: invitations.email,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(eq(invitations.id, invitationId))
    .limit(1);

  return result[0] ?? null;
};

export const revokeInvitationById = async (invitationId: string): Promise<void> => {
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(eq(invitations.id, invitationId));
};
