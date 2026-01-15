// =============================================================================
// Permissions
// =============================================================================

export interface Permission {
  id: string;
  name: string;
  description: string | null;
}

// =============================================================================
// Roles
// =============================================================================

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface RoleWithUserCount extends Role {
  userCount: number;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

// =============================================================================
// Responses
// =============================================================================

export interface ListPermissionsResponse {
  permissions: Permission[];
}

export interface ListRolesResponse {
  roles: RoleWithUserCount[];
}

export interface GetRoleResponse {
  role: RoleWithPermissions;
}

export interface CreateRoleResponse {
  role: Role;
}

export interface UpdateRoleResponse {
  role: Role;
}

export interface SetRolePermissionsResponse {
  role: RoleWithPermissions;
}
