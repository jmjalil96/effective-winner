import { eq, and, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { getTestDb } from '../setup.js';
import {
  roles,
  permissions,
  rolePermissions,
  users,
  type Role,
  type Permission,
} from '../../db/schema/index.js';

// =============================================================================
// Role Creation
// =============================================================================

export interface CreateTestRoleOptions {
  organizationId: string;
  name?: string;
  description?: string;
  isDefault?: boolean;
  deleted?: boolean;
  permissionNames?: string[];
}

export interface CreateTestRoleResult {
  role: Role;
}

/**
 * Create a test role directly in the database.
 */
export const createTestRole = async (
  options: CreateTestRoleOptions
): Promise<CreateTestRoleResult> => {
  const db = getTestDb();
  const uniqueId = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

  const [role] = await db
    .insert(roles)
    .values({
      id: uuidv7(),
      organizationId: options.organizationId,
      name: options.name ?? `TestRole-${uniqueId}`,
      description: options.description ?? null,
      isDefault: options.isDefault ?? false,
      deletedAt: options.deleted ? new Date() : null,
    })
    .returning();

  if (!role) throw new Error('Failed to create test role');

  // Add permissions if specified
  if (options.permissionNames && options.permissionNames.length > 0) {
    // Get all permissions by name
    const allPerms: Permission[] = [];
    for (const permName of options.permissionNames) {
      const [perm] = await db.select().from(permissions).where(eq(permissions.name, permName));
      if (perm) allPerms.push(perm);
    }

    // Insert role_permissions
    if (allPerms.length > 0) {
      await db.insert(rolePermissions).values(
        allPerms.map((perm) => ({
          roleId: role.id,
          permissionId: perm.id,
        }))
      );
    }
  }

  return { role };
};

// =============================================================================
// Role Queries
// =============================================================================

/**
 * Get role by ID (includes soft-deleted).
 */
export const getRoleById = async (id: string): Promise<Role | null> => {
  const db = getTestDb();
  const result = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  return result[0] ?? null;
};

/**
 * Get role by ID (excludes soft-deleted).
 */
export const getActiveRoleById = async (id: string): Promise<Role | null> => {
  const db = getTestDb();
  const result = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), isNull(roles.deletedAt)))
    .limit(1);
  return result[0] ?? null;
};

/**
 * Get all roles for an organization.
 */
export const getRolesForOrg = async (organizationId: string): Promise<Role[]> => {
  const db = getTestDb();
  return db
    .select()
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), isNull(roles.deletedAt)));
};

/**
 * Get permissions for a role.
 */
export const getRolePermissions = async (roleId: string): Promise<Permission[]> => {
  const db = getTestDb();
  const result = await db
    .select({
      id: permissions.id,
      name: permissions.name,
      description: permissions.description,
      createdAt: permissions.createdAt,
      updatedAt: permissions.updatedAt,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
  return result;
};

/**
 * Get all permissions in the system.
 */
export const getAllPermissions = async (): Promise<Permission[]> => {
  const db = getTestDb();
  return db.select().from(permissions).orderBy(permissions.name);
};

/**
 * Get permission by name.
 */
export const getPermissionByName = async (name: string): Promise<Permission | null> => {
  const db = getTestDb();
  const result = await db.select().from(permissions).where(eq(permissions.name, name)).limit(1);
  return result[0] ?? null;
};

// =============================================================================
// Role Mutations
// =============================================================================

/**
 * Assign a user to a role (update user's roleId).
 */
export const assignUserToRole = async (userId: string, roleId: string): Promise<void> => {
  const db = getTestDb();
  await db.update(users).set({ roleId }).where(eq(users.id, userId));
};

/**
 * Soft-delete a role.
 */
export const softDeleteRole = async (roleId: string): Promise<void> => {
  const db = getTestDb();
  await db.update(roles).set({ deletedAt: new Date() }).where(eq(roles.id, roleId));
};

/**
 * Add permissions to a role.
 */
export const addPermissionsToRole = async (
  roleId: string,
  permissionIds: string[]
): Promise<void> => {
  const db = getTestDb();
  if (permissionIds.length === 0) return;

  await db.insert(rolePermissions).values(
    permissionIds.map((permissionId) => ({
      roleId,
      permissionId,
    }))
  );
};

/**
 * Clear all permissions from a role.
 */
export const clearRolePermissions = async (roleId: string): Promise<void> => {
  const db = getTestDb();
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
};
