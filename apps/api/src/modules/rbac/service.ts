import { createChildLogger } from '../../config/logger.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../../errors/index.js';
import { logWithContext, AUDIT_ACTIONS, toAuditContext } from '../../lib/services/index.js';
import type {
  CreateRoleInput,
  UpdateRoleInput,
  SetRolePermissionsInput,
  Permission,
  Role,
  RoleWithUserCount,
  RoleWithPermissions,
} from '@crm/shared';
import {
  findAllPermissions,
  findRolesByOrganization,
  findRoleById,
  findRolePermissions,
  checkRoleNameExists,
  countUsersWithRole,
  createRole,
  updateRole,
  softDeleteRole,
  setRolePermissions,
  validatePermissionIds,
} from './repository.js';
import { RBAC_ERRORS } from './constants.js';
import { mapRole, mapRoleWithUserCount, mapRoleWithPermissions } from './utils.js';

const serviceLogger = createChildLogger({ module: 'rbac' });

// =============================================================================
// Context Interfaces
// =============================================================================

export interface RbacContext {
  organizationId: string;
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

// =============================================================================
// List Permissions
// =============================================================================

export const listPermissions = async (): Promise<Permission[]> => {
  const permissions = await findAllPermissions();
  return permissions;
};

// =============================================================================
// List Roles
// =============================================================================

export const listRoles = async (ctx: RbacContext): Promise<RoleWithUserCount[]> => {
  const roles = await findRolesByOrganization(ctx.organizationId);
  return roles.map(mapRoleWithUserCount);
};

// =============================================================================
// Get Role
// =============================================================================

export const getRole = async (roleId: string, ctx: RbacContext): Promise<RoleWithPermissions> => {
  const role = await findRoleById(roleId, ctx.organizationId);

  if (!role) {
    throw new NotFoundError(RBAC_ERRORS.ROLE_NOT_FOUND);
  }

  const permissions = await findRolePermissions(roleId);
  return mapRoleWithPermissions(role, permissions);
};

// =============================================================================
// Create Role
// =============================================================================

export const createRoleService = async (
  input: CreateRoleInput,
  ctx: RbacContext
): Promise<Role> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Check name uniqueness
  const nameExists = await checkRoleNameExists(ctx.organizationId, input.name);
  if (nameExists) {
    throw new ConflictError(RBAC_ERRORS.ROLE_NAME_EXISTS);
  }

  // 2. Create role
  const role = await createRole({
    organizationId: ctx.organizationId,
    name: input.name,
    description: input.description,
  });

  // 3. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.ROLE_CREATE,
    entityType: 'role',
    entityId: role.id,
    metadata: { name: input.name },
  });

  serviceLogger.info(
    { roleId: role.id, name: input.name, requestId: ctx.requestId },
    'Role created'
  );

  return mapRole(role);
};

// =============================================================================
// Update Role
// =============================================================================

export const updateRoleService = async (
  roleId: string,
  input: UpdateRoleInput,
  ctx: RbacContext
): Promise<Role> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find role
  const existingRole = await findRoleById(roleId, ctx.organizationId);
  if (!existingRole) {
    throw new NotFoundError(RBAC_ERRORS.ROLE_NOT_FOUND);
  }

  // 2. Cannot update default role name
  if (existingRole.isDefault && input.name && input.name !== existingRole.name) {
    throw new ForbiddenError(RBAC_ERRORS.CANNOT_RENAME_DEFAULT);
  }

  // 3. Check name uniqueness (if changing)
  if (input.name && input.name !== existingRole.name) {
    const nameExists = await checkRoleNameExists(ctx.organizationId, input.name, roleId);
    if (nameExists) {
      throw new ConflictError(RBAC_ERRORS.ROLE_NAME_EXISTS);
    }
  }

  // 4. Check if there's anything to update
  const hasNameChange = input.name !== undefined;
  const hasDescChange = input.description !== undefined;

  // If nothing to update, return existing role
  if (!hasNameChange && !hasDescChange) {
    return mapRole(existingRole);
  }

  // 5. Update role
  const role = await updateRole(roleId, {
    name: input.name,
    description: input.description,
  });

  // 5. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.ROLE_UPDATE,
    entityType: 'role',
    entityId: roleId,
    changes: {
      before: { name: existingRole.name, description: existingRole.description },
      after: { name: role.name, description: role.description },
    },
  });

  serviceLogger.info({ roleId, requestId: ctx.requestId }, 'Role updated');

  return mapRole(role);
};

// =============================================================================
// Delete Role
// =============================================================================

export const deleteRoleService = async (roleId: string, ctx: RbacContext): Promise<void> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find role
  const role = await findRoleById(roleId, ctx.organizationId);
  if (!role) {
    throw new NotFoundError(RBAC_ERRORS.ROLE_NOT_FOUND);
  }

  // 2. Cannot delete default role
  if (role.isDefault) {
    throw new ForbiddenError(RBAC_ERRORS.CANNOT_DELETE_DEFAULT);
  }

  // 3. Cannot delete role with users
  const userCount = await countUsersWithRole(roleId);
  if (userCount > 0) {
    throw new ConflictError(RBAC_ERRORS.CANNOT_DELETE_WITH_USERS(userCount));
  }

  // 4. Soft delete
  await softDeleteRole(roleId);

  // 5. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.ROLE_DELETE,
    entityType: 'role',
    entityId: roleId,
    metadata: { name: role.name },
  });

  serviceLogger.info({ roleId, name: role.name, requestId: ctx.requestId }, 'Role deleted');
};

// =============================================================================
// Set Role Permissions
// =============================================================================

export const setRolePermissionsService = async (
  roleId: string,
  input: SetRolePermissionsInput,
  ctx: RbacContext
): Promise<RoleWithPermissions> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find role
  const role = await findRoleById(roleId, ctx.organizationId);
  if (!role) {
    throw new NotFoundError(RBAC_ERRORS.ROLE_NOT_FOUND);
  }

  // 2. Cannot modify default role permissions
  if (role.isDefault) {
    throw new ForbiddenError(RBAC_ERRORS.CANNOT_MODIFY_DEFAULT_PERMS);
  }

  // 3. Validate permission IDs exist
  const validIds = await validatePermissionIds(input.permissionIds);
  if (!validIds) {
    throw new ValidationError(RBAC_ERRORS.INVALID_PERMISSION_IDS);
  }

  // 4. Get current permissions for audit
  const beforePermissions = await findRolePermissions(roleId);

  // 5. Set permissions
  await setRolePermissions(roleId, input.permissionIds);

  // 6. Get new permissions
  const afterPermissions = await findRolePermissions(roleId);

  // 7. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.ROLE_PERMISSION_GRANT,
    entityType: 'role',
    entityId: roleId,
    changes: {
      before: beforePermissions.map((p) => p.name),
      after: afterPermissions.map((p) => p.name),
    },
  });

  serviceLogger.info(
    { roleId, permissionCount: afterPermissions.length, requestId: ctx.requestId },
    'Role permissions updated'
  );

  return mapRoleWithPermissions(role, afterPermissions);
};
