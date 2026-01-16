import { z } from 'zod';
import { GOV_ID_TYPES, AGENT_STATUSES } from '../constants/agents.js';

// =============================================================================
// Create Agent
// =============================================================================

export const createAgentSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  govIdType: z.enum(GOV_ID_TYPES).optional(),
  govIdNumber: z.string().max(20).optional(),
  email: z.email().transform((e) => e.toLowerCase().trim()).optional(),
  phone: z.string().max(50).optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  isHouseAgent: z.boolean().optional().default(false),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

// =============================================================================
// Get Agent
// =============================================================================

export const agentIdParamSchema = z.object({
  id: z.uuid(),
});

export type AgentIdParam = z.infer<typeof agentIdParamSchema>;

// =============================================================================
// Update Agent
// =============================================================================

export const updateAgentSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  govIdType: z.enum(GOV_ID_TYPES).nullable().optional(),
  govIdNumber: z.string().max(20).nullable().optional(),
  email: z.email().transform((e) => e.toLowerCase().trim()).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .nullable()
    .optional(),
  status: z.enum(AGENT_STATUSES).optional(),
  isHouseAgent: z.boolean().optional(),
});

export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

// =============================================================================
// List Agents
// =============================================================================

export const listAgentsQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  // Filters
  status: z.enum(AGENT_STATUSES).optional(),
  isHouseAgent: z.coerce.boolean().optional(),

  // Search
  search: z.string().max(100).optional(),

  // Sorting
  sortBy: z.enum(['status', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>;
