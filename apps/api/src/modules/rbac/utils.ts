import type { Role, RoleWithUserCount, RoleWithPermissions, Permission } from '@crm/shared';
import type { RoleRow, RoleWithUserCountRow, PermissionRow } from './repository.js';

export const mapRole = (row: RoleRow): Role => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isDefault: row.isDefault,
  createdAt: row.createdAt.toISOString(),
});

export const mapRoleWithUserCount = (row: RoleWithUserCountRow): RoleWithUserCount => ({
  ...mapRole(row),
  userCount: row.userCount,
});

export const mapRoleWithPermissions = (
  row: RoleRow,
  permissions: PermissionRow[]
): RoleWithPermissions => ({
  ...mapRole(row),
  permissions: permissions as Permission[],
});
