import { z } from 'zod';

// =============================================================================
// Roles
// =============================================================================

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const setRolePermissionsSchema = z.object({
  permissionIds: z
    .array(z.uuid())
    .min(0)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Permission IDs must be unique',
    }),
});

export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;

// =============================================================================
// Params (for route validation)
// =============================================================================

export const roleIdParamSchema = z.object({
  id: z.uuid(),
});

export type RoleIdParam = z.infer<typeof roleIdParamSchema>;
