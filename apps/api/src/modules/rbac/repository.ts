import { eq, and, isNull, sql, inArray, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { roles, permissions, rolePermissions, users } from '../../db/schema/index.js';
import { AppError } from '../../errors/index.js';

// =============================================================================
// Interfaces
// =============================================================================

export interface PermissionRow {
  id: string;
  name: string;
  description: string | null;
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  organizationId: string;
}

export interface RoleWithUserCountRow extends RoleRow {
  userCount: number;
}

// =============================================================================
// Permissions
// =============================================================================

export const findAllPermissions = async (): Promise<PermissionRow[]> => {
  return await db
    .select({
      id: permissions.id,
      name: permissions.name,
      description: permissions.description,
    })
    .from(permissions)
    .orderBy(permissions.name);
};

// =============================================================================
// Roles
// =============================================================================

export const findRolesByOrganization = async (
  organizationId: string
): Promise<RoleWithUserCountRow[]> => {
  const result = await db
    .select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      isDefault: roles.isDefault,
      createdAt: roles.createdAt,
      organizationId: roles.organizationId,
      userCount: sql<number>`count(${users.id})::int`,
    })
    .from(roles)
    .leftJoin(users, and(eq(users.roleId, roles.id), isNull(users.deletedAt)))
    .where(and(eq(roles.organizationId, organizationId), isNull(roles.deletedAt)))
    .groupBy(roles.id)
    .orderBy(roles.name);

  return result;
};

export const findRoleById = async (
  roleId: string,
  organizationId: string
): Promise<RoleRow | null> => {
  const result = await db
    .select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      isDefault: roles.isDefault,
      createdAt: roles.createdAt,
      organizationId: roles.organizationId,
    })
    .from(roles)
    .where(
      and(eq(roles.id, roleId), eq(roles.organizationId, organizationId), isNull(roles.deletedAt))
    )
    .limit(1);

  return result[0] ?? null;
};

export const findRolePermissions = async (roleId: string): Promise<PermissionRow[]> => {
  const result = await db
    .select({
      id: permissions.id,
      name: permissions.name,
      description: permissions.description,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId))
    .orderBy(permissions.name);

  return result;
};

export const checkRoleNameExists = async (
  organizationId: string,
  name: string,
  excludeRoleId?: string
): Promise<boolean> => {
  const conditions = [
    eq(roles.organizationId, organizationId),
    eq(roles.name, name),
    isNull(roles.deletedAt),
  ];

  if (excludeRoleId) {
    conditions.push(ne(roles.id, excludeRoleId));
  }

  const result = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(...conditions))
    .limit(1);

  return result.length > 0;
};

export const countUsersWithRole = async (roleId: string): Promise<number> => {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.roleId, roleId), isNull(users.deletedAt)));

  return result[0]?.count ?? 0;
};

export const createRole = async (params: {
  organizationId: string;
  name: string;
  description?: string;
}): Promise<RoleRow> => {
  const result = await db
    .insert(roles)
    .values({
      organizationId: params.organizationId,
      name: params.name,
      description: params.description,
    })
    .returning({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      isDefault: roles.isDefault,
      createdAt: roles.createdAt,
      organizationId: roles.organizationId,
    });

  const role = result[0];
  if (!role) throw new AppError('Failed to create role', 500, 'DB_INSERT_FAILED');
  return role;
};

export const updateRole = async (
  roleId: string,
  params: { name?: string; description?: string | null }
): Promise<RoleRow> => {
  const result = await db
    .update(roles)
    .set({
      ...(params.name !== undefined && { name: params.name }),
      ...(params.description !== undefined && { description: params.description }),
    })
    .where(eq(roles.id, roleId))
    .returning({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      isDefault: roles.isDefault,
      createdAt: roles.createdAt,
      organizationId: roles.organizationId,
    });

  const role = result[0];
  if (!role) throw new AppError('Failed to update role', 500, 'DB_UPDATE_FAILED');
  return role;
};

export const softDeleteRole = async (roleId: string): Promise<void> => {
  await db.update(roles).set({ deletedAt: new Date() }).where(eq(roles.id, roleId));
};

export const setRolePermissions = async (
  roleId: string,
  permissionIds: string[]
): Promise<void> => {
  await db.transaction(async (tx) => {
    // Delete existing permissions
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

    // Insert new permissions (if any)
    if (permissionIds.length > 0) {
      await tx.insert(rolePermissions).values(
        permissionIds.map((permissionId) => ({
          roleId,
          permissionId,
        }))
      );
    }
  });
};

export const validatePermissionIds = async (permissionIds: string[]): Promise<boolean> => {
  if (permissionIds.length === 0) return true;

  const result = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.id, permissionIds));

  return result.length === permissionIds.length;
};
