import { z } from 'zod';
import {
  CLIENT_TYPES,
  CLIENT_STATUSES,
  CLIENT_GOV_ID_TYPES,
  CLIENT_GOV_ID_TYPES_INDIVIDUAL,
  CLIENT_GOV_ID_TYPES_BUSINESS,
  SEXES,
} from '../constants/clients.js';

// =============================================================================
// Create Client - Discriminated Union
// =============================================================================

const createIndividualClientSchema = z.object({
  clientType: z.literal('individual'),
  accountId: z.uuid(),
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().min(1).max(255),
  govIdType: z.enum(CLIENT_GOV_ID_TYPES_INDIVIDUAL).optional(),
  govIdNumber: z.string().max(20).optional(),
  phone: z.string().max(50).optional(),
  email: z
    .email()
    .transform((e) => e.toLowerCase().trim())
    .optional(),
  sex: z.enum(SEXES).optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  status: z.enum(CLIENT_STATUSES).optional().default('active'),
});

const createBusinessClientSchema = z.object({
  clientType: z.literal('business'),
  accountId: z.uuid(),
  companyName: z.string().trim().min(1).max(255),
  govIdType: z.enum(CLIENT_GOV_ID_TYPES_BUSINESS).optional(),
  govIdNumber: z.string().max(20).optional(),
  phone: z.string().max(50).optional(),
  email: z
    .email()
    .transform((e) => e.toLowerCase().trim())
    .optional(),
  businessDescription: z.string().max(2000).optional(),
  status: z.enum(CLIENT_STATUSES).optional().default('active'),
});

export const createClientSchema = z.discriminatedUnion('clientType', [
  createIndividualClientSchema,
  createBusinessClientSchema,
]);

export type CreateClientInput = z.infer<typeof createClientSchema>;

// =============================================================================
// Client ID Param
// =============================================================================

export const clientIdParamSchema = z.object({
  id: z.uuid(),
});

export type ClientIdParam = z.infer<typeof clientIdParamSchema>;

// =============================================================================
// Update Client - Flat Schema (service-layer type validation)
// =============================================================================

export const updateClientSchema = z.object({
  clientType: z.enum(CLIENT_TYPES).optional(),
  firstName: z.string().trim().min(1).max(255).optional(),
  lastName: z.string().trim().min(1).max(255).optional(),
  companyName: z.string().trim().min(1).max(255).optional(),
  govIdType: z.enum(CLIENT_GOV_ID_TYPES).nullable().optional(),
  govIdNumber: z.string().max(20).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z
    .email()
    .transform((e) => e.toLowerCase().trim())
    .nullable()
    .optional(),
  sex: z.enum(SEXES).nullable().optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .nullable()
    .optional(),
  businessDescription: z.string().max(2000).nullable().optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
});

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// =============================================================================
// List Clients
// =============================================================================

export const listClientsQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  // Filters
  clientType: z.enum(CLIENT_TYPES).optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
  accountName: z.string().max(255).optional(),
  firstName: z.string().max(255).optional(),
  lastName: z.string().max(255).optional(),
  companyName: z.string().max(255).optional(),

  // Search
  search: z.string().max(100).optional(),

  // Sorting
  sortBy: z.enum(['name', 'createdAt', 'clientId']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
