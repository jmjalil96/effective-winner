import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  sessions,
  users,
  organizations,
  roles,
  rolePermissions,
  permissions,
} from '../db/schema.js';

export const hashSessionId = (sid: string): string =>
  crypto.createHash('sha256').update(sid).digest('hex');

export interface SessionContext {
  session: {
    id: string;
    expiresAt: Date;
    revokedAt: Date | null;
    lastAccessedAt: Date;
  };
  user: {
    id: string;
    email: string;
    isActive: boolean;
    deletedAt: Date | null;
  };
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
  permissions: string[];
}

export const findSessionWithContext = async (sidHash: string): Promise<SessionContext | null> => {
  // Single query for session + user + org + role
  const result = await db
    .select({
      session: {
        id: sessions.id,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        lastAccessedAt: sessions.lastAccessedAt,
      },
      user: {
        id: users.id,
        email: users.email,
        isActive: users.isActive,
        deletedAt: users.deletedAt,
      },
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
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(organizations, eq(sessions.organizationId, organizations.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(sessions.sidHash, sidHash))
    .limit(1);

  if (!result[0]) {
    return null;
  }

  const { session, user, organization, role } = result[0];

  // Separate query for permissions (many-to-many)
  const perms = await db
    .select({ name: permissions.name })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, role.id));

  return {
    session,
    user,
    organization,
    role,
    permissions: perms.map((p) => p.name),
  };
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
};

export const touchSession = async (sessionId: string): Promise<void> => {
  await db.update(sessions).set({ lastAccessedAt: new Date() }).where(eq(sessions.id, sessionId));
};
