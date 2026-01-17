import { z } from 'zod';
import { INSURER_STATUSES } from '../constants/insurers.js';

// =============================================================================
// Create Insurer
// =============================================================================

export const createInsurerSchema = z.object({
  name: z.string().min(1).max(255),
  govId: z.string().max(20).optional(),
  contractNumber: z.string().max(100).optional(),
  email: z
    .email()
    .max(255)
    .transform((e) => e.toLowerCase().trim())
    .optional(),
  phone: z.string().max(50).optional(),
  status: z.enum(INSURER_STATUSES).optional().default('active'),
});

export type CreateInsurerInput = z.infer<typeof createInsurerSchema>;

// =============================================================================
// Get Insurer
// =============================================================================

export const insurerIdParamSchema = z.object({
  id: z.uuid(),
});

export type InsurerIdParam = z.infer<typeof insurerIdParamSchema>;

// =============================================================================
// Update Insurer
// =============================================================================

export const updateInsurerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  govId: z.string().max(20).nullable().optional(),
  contractNumber: z.string().max(100).nullable().optional(),
  email: z
    .email()
    .max(255)
    .transform((e) => e.toLowerCase().trim())
    .nullable()
    .optional(),
  phone: z.string().max(50).nullable().optional(),
  status: z.enum(INSURER_STATUSES).optional(),
});

export type UpdateInsurerInput = z.infer<typeof updateInsurerSchema>;

// =============================================================================
// List Insurers
// =============================================================================

export const listInsurersQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  // Filters
  status: z.enum(INSURER_STATUSES).optional(),

  // Search
  search: z.string().max(100).optional(),

  // Sorting
  sortBy: z.enum(['name', 'status', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListInsurersQuery = z.infer<typeof listInsurersQuerySchema>;
