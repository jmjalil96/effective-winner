import { z } from 'zod';
import { ACCOUNT_STATUSES } from '../constants/accounts.js';

// =============================================================================
// Create Account
// =============================================================================

export const createAccountSchema = z.object({
  agentId: z.uuid(),
  name: z.string().min(1).max(255),
  status: z.enum(ACCOUNT_STATUSES).optional().default('active'),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

// =============================================================================
// Get Account
// =============================================================================

export const accountIdParamSchema = z.object({
  id: z.uuid(),
});

export type AccountIdParam = z.infer<typeof accountIdParamSchema>;

// =============================================================================
// Update Account
// =============================================================================

export const updateAccountSchema = z.object({
  agentId: z.uuid().optional(),
  name: z.string().min(1).max(255).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// =============================================================================
// List Accounts
// =============================================================================

export const listAccountsQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  // Filters
  status: z.enum(ACCOUNT_STATUSES).optional(),
  agentName: z.string().max(255).optional(),

  // Search
  search: z.string().max(100).optional(),

  // Sorting
  sortBy: z.enum(['name', 'status', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;
