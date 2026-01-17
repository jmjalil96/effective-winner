import { createChildLogger } from '../../config/logger.js';
import { NotFoundError, ConflictError } from '../../errors/index.js';
import { logWithContext, AUDIT_ACTIONS, toAuditContext } from '../../lib/services/index.js';
import type {
  CreateInsurerInput,
  UpdateInsurerInput,
  ListInsurersQuery,
  Insurer,
  ListInsurersResponse,
} from '@crm/shared';
import {
  findInsurerById,
  createInsurer,
  updateInsurer,
  listInsurers,
  hasInsurerRelatedData,
  softDeleteInsurer,
} from './repository.js';
import { INSURER_ERRORS } from './constants.js';
import { mapInsurer } from './utils.js';

const serviceLogger = createChildLogger({ module: 'insurers' });

// =============================================================================
// Context Interfaces
// =============================================================================

export interface InsurerContext {
  organizationId: string;
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

// =============================================================================
// Create Insurer
// =============================================================================

export const createInsurerService = async (
  input: CreateInsurerInput,
  ctx: InsurerContext
): Promise<Insurer> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Create insurer
  const insurer = await createInsurer({
    organizationId: ctx.organizationId,
    name: input.name,
    govId: input.govId,
    contractNumber: input.contractNumber,
    email: input.email,
    phone: input.phone,
    status: input.status,
  });

  // 2. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.INSURER_CREATE,
    entityType: 'insurer',
    entityId: insurer.id,
    metadata: {
      name: insurer.name,
      govId: insurer.govId,
      contractNumber: insurer.contractNumber,
    },
  });

  serviceLogger.info({ insurerId: insurer.id, requestId: ctx.requestId }, 'Insurer created');

  return mapInsurer(insurer);
};

// =============================================================================
// Get Insurer
// =============================================================================

export const getInsurerService = async (
  insurerId: string,
  ctx: InsurerContext
): Promise<Insurer> => {
  const insurer = await findInsurerById(insurerId, ctx.organizationId);

  if (!insurer) {
    throw new NotFoundError(INSURER_ERRORS.INSURER_NOT_FOUND);
  }

  return mapInsurer(insurer);
};

// =============================================================================
// Update Insurer
// =============================================================================

export const updateInsurerService = async (
  insurerId: string,
  input: UpdateInsurerInput,
  ctx: InsurerContext
): Promise<Insurer> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find existing insurer
  const existing = await findInsurerById(insurerId, ctx.organizationId);
  if (!existing) {
    throw new NotFoundError(INSURER_ERRORS.INSURER_NOT_FOUND);
  }

  // 2. Check if anything to update (no-op handling)
  const hasChanges =
    input.name !== undefined ||
    input.govId !== undefined ||
    input.contractNumber !== undefined ||
    input.email !== undefined ||
    input.phone !== undefined ||
    input.status !== undefined;

  if (!hasChanges) {
    return mapInsurer(existing);
  }

  // 3. Update
  const insurer = await updateInsurer(insurerId, ctx.organizationId, input);

  // 4. Audit log with before/after
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.INSURER_UPDATE,
    entityType: 'insurer',
    entityId: insurerId,
    changes: {
      before: {
        name: existing.name,
        govId: existing.govId,
        contractNumber: existing.contractNumber,
        email: existing.email,
        phone: existing.phone,
        status: existing.status,
      },
      after: {
        name: insurer.name,
        govId: insurer.govId,
        contractNumber: insurer.contractNumber,
        email: insurer.email,
        phone: insurer.phone,
        status: insurer.status,
      },
    },
  });

  serviceLogger.info({ insurerId: insurer.id, requestId: ctx.requestId }, 'Insurer updated');

  return mapInsurer(insurer);
};

// =============================================================================
// List Insurers
// =============================================================================

export const listInsurersService = async (
  query: ListInsurersQuery,
  ctx: InsurerContext
): Promise<ListInsurersResponse> => {
  const result = await listInsurers({
    organizationId: ctx.organizationId,
    page: query.page,
    limit: query.limit,
    status: query.status,
    search: query.search,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });

  return {
    insurers: result.insurers.map(mapInsurer),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
    },
  };
};

// =============================================================================
// Delete Insurer
// =============================================================================

export const deleteInsurerService = async (
  insurerId: string,
  ctx: InsurerContext
): Promise<void> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find insurer
  const insurer = await findInsurerById(insurerId, ctx.organizationId);
  if (!insurer) {
    throw new NotFoundError(INSURER_ERRORS.INSURER_NOT_FOUND);
  }

  // 2. Check for related data
  const { hasProducts, hasStatements } = await hasInsurerRelatedData(
    insurerId,
    ctx.organizationId
  );

  if (hasProducts) {
    throw new ConflictError(INSURER_ERRORS.CANNOT_DELETE_WITH_PRODUCTS);
  }

  if (hasStatements) {
    throw new ConflictError(INSURER_ERRORS.CANNOT_DELETE_WITH_STATEMENTS);
  }

  // 3. Soft delete
  await softDeleteInsurer(insurerId, ctx.organizationId);

  // 4. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.INSURER_DELETE,
    entityType: 'insurer',
    entityId: insurerId,
    metadata: {
      name: insurer.name,
      govId: insurer.govId,
    },
  });

  serviceLogger.info({ insurerId: insurer.id, requestId: ctx.requestId }, 'Insurer deleted');
};
