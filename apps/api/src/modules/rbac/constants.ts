export const RBAC_ERRORS = {
  ROLE_NOT_FOUND: 'Role not found',
  ROLE_NAME_EXISTS: 'Role name already exists',
  CANNOT_RENAME_DEFAULT: 'Cannot rename default role',
  CANNOT_DELETE_DEFAULT: 'Cannot delete default role',
  CANNOT_DELETE_WITH_USERS: (count: number) =>
    `Cannot delete role with ${String(count)} assigned user(s)`,
  CANNOT_MODIFY_DEFAULT_PERMS: 'Cannot modify default role permissions',
  INVALID_PERMISSION_IDS: 'One or more permission IDs are invalid',
} as const;
