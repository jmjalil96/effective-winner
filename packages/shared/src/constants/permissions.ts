export const PERMISSIONS = [
  { name: 'roles:read', description: 'View roles and permissions' },
  { name: 'roles:write', description: 'Create and update roles' },
  { name: 'roles:delete', description: 'Delete roles' },
  { name: 'invitations:read', description: 'View pending invitations' },
  { name: 'invitations:create', description: 'Send invitations' },
  { name: 'invitations:delete', description: 'Revoke invitations' },
] as const;

export type PermissionName = (typeof PERMISSIONS)[number]['name'];
