import { createChildLogger } from '../../config/logger.js';
import { ConflictError, NotFoundError, ValidationError } from '../../errors/index.js';
import { logWithContext, AUDIT_ACTIONS, toAuditContext } from '../../lib/services/index.js';
import type {
  CreateClientInput,
  UpdateClientInput,
  ListClientsQuery,
  Client,
  ListClientsResponse,
} from '@crm/shared';
import {
  getNextClientId,
  findAccountById,
  findClientByEmail,
  findClientByGovId,
  findClientById,
  findClientByEmailExcluding,
  findClientByGovIdExcluding,
  createClient,
  updateClient,
  listClients,
  hasClientRelatedData,
  softDeleteClient,
} from './repository.js';
import type { UpdateClientParams } from './repository.js';
import { CLIENT_ERRORS } from './constants.js';
import { computeDisplayName, mapClient, isValidGovIdTypeForClientType, normalizeName } from './utils.js';

const serviceLogger = createChildLogger({ module: 'clients' });

// =============================================================================
// Context Interfaces
// =============================================================================

export interface ClientContext {
  organizationId: string;
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

// =============================================================================
// Create Client
// =============================================================================

export const createClientService = async (
  input: CreateClientInput,
  ctx: ClientContext
): Promise<Client> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Validate account exists and belongs to org
  const account = await findAccountById(input.accountId, ctx.organizationId);
  if (!account) {
    throw new NotFoundError(CLIENT_ERRORS.ACCOUNT_NOT_FOUND);
  }

  // 2. Check email uniqueness (if provided)
  if (input.email) {
    const existingByEmail = await findClientByEmail(ctx.organizationId, input.email);
    if (existingByEmail) {
      throw new ConflictError(CLIENT_ERRORS.EMAIL_EXISTS);
    }
  }

  // 3. Check govIdNumber uniqueness (if provided)
  if (input.govIdNumber) {
    const existingByGovId = await findClientByGovId(ctx.organizationId, input.govIdNumber);
    if (existingByGovId) {
      throw new ConflictError(CLIENT_ERRORS.GOV_ID_EXISTS);
    }
  }

  // 4. Generate auto-incremented clientId (atomic)
  const clientId = await getNextClientId(ctx.organizationId);

  // 5. Compute display name based on type
  const name = computeDisplayName(input);

  // 6. Create client
  const created = await createClient({
    organizationId: ctx.organizationId,
    clientId,
    accountId: input.accountId,
    clientType: input.clientType,
    name,
    firstName: input.clientType === 'individual' ? input.firstName : null,
    lastName: input.clientType === 'individual' ? input.lastName : null,
    companyName: input.clientType === 'business' ? input.companyName : null,
    govIdType: input.govIdType,
    govIdNumber: input.govIdNumber,
    phone: input.phone,
    email: input.email,
    sex: input.clientType === 'individual' ? input.sex : null,
    dob: input.clientType === 'individual' ? input.dob : null,
    businessDescription: input.clientType === 'business' ? input.businessDescription : null,
    status: input.status,
  });

  // 7. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.CLIENT_CREATE,
    entityType: 'client',
    entityId: created.id,
    metadata: {
      clientId: created.clientId,
      clientType: created.clientType,
      name: created.name,
      accountId: created.accountId,
    },
  });

  serviceLogger.info({ clientId: created.clientId, requestId: ctx.requestId }, 'Client created');

  // 8. Re-fetch to get full data with account info
  const client = await findClientById(created.id, ctx.organizationId);
  if (!client) {
    throw new NotFoundError(CLIENT_ERRORS.CLIENT_NOT_FOUND);
  }

  return mapClient(client);
};

// =============================================================================
// Update Client
// =============================================================================

export const updateClientService = async (
  clientId: string,
  input: UpdateClientInput,
  ctx: ClientContext
): Promise<Client> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find existing client
  const existing = await findClientById(clientId, ctx.organizationId);
  if (!existing) {
    throw new NotFoundError(CLIENT_ERRORS.CLIENT_NOT_FOUND);
  }

  // 2. Determine final clientType
  const finalClientType = (input.clientType ?? existing.clientType) as 'individual' | 'business';
  const isTypeChanging = input.clientType !== undefined && input.clientType !== existing.clientType;

  // 3. Validate type change requirements
  if (isTypeChanging) {
    if (finalClientType === 'business' && !input.companyName) {
      throw new ValidationError(CLIENT_ERRORS.TYPE_CHANGE_MISSING_FIELDS);
    }
    if (finalClientType === 'individual' && (!input.firstName || !input.lastName)) {
      throw new ValidationError(CLIENT_ERRORS.TYPE_CHANGE_MISSING_FIELDS);
    }
  }

  // 4. Validate govIdType against final clientType
  const finalGovIdType = input.govIdType !== undefined ? input.govIdType : existing.govIdType;
  if (!isValidGovIdTypeForClientType(finalGovIdType, finalClientType)) {
    throw new ValidationError(CLIENT_ERRORS.INVALID_GOV_ID_TYPE);
  }

  // 5. Check email uniqueness (if changing)
  if (input.email && input.email.toLowerCase() !== existing.email?.toLowerCase()) {
    const emailExists = await findClientByEmailExcluding(ctx.organizationId, input.email, clientId);
    if (emailExists) {
      throw new ConflictError(CLIENT_ERRORS.EMAIL_EXISTS);
    }
  }

  // 6. Check govIdNumber uniqueness (if changing)
  if (input.govIdNumber && input.govIdNumber !== existing.govIdNumber) {
    const govIdExists = await findClientByGovIdExcluding(
      ctx.organizationId,
      input.govIdNumber,
      clientId
    );
    if (govIdExists) {
      throw new ConflictError(CLIENT_ERRORS.GOV_ID_EXISTS);
    }
  }

  // 7. Check if anything to update
  const hasChanges = Object.keys(input).length > 0;
  if (!hasChanges) {
    return mapClient(existing);
  }

  // 8. Build update params with type transition logic
  const updateParams: UpdateClientParams = {};

  if (isTypeChanging) {
    updateParams.clientType = finalClientType;
    if (finalClientType === 'business') {
      // Clear individual fields
      updateParams.firstName = null;
      updateParams.lastName = null;
      updateParams.sex = null;
      updateParams.dob = null;
      // Set business fields (validated above)
      updateParams.companyName = input.companyName ?? '';
      if (input.businessDescription !== undefined)
        updateParams.businessDescription = input.businessDescription;
    } else {
      // Clear business fields
      updateParams.companyName = null;
      updateParams.businessDescription = null;
      // Set individual fields (validated above)
      updateParams.firstName = input.firstName ?? '';
      updateParams.lastName = input.lastName ?? '';
      if (input.sex !== undefined) updateParams.sex = input.sex;
      if (input.dob !== undefined) updateParams.dob = input.dob;
    }
  } else {
    // Same type - apply provided fields
    if (finalClientType === 'individual') {
      if (input.firstName !== undefined) updateParams.firstName = input.firstName;
      if (input.lastName !== undefined) updateParams.lastName = input.lastName;
      if (input.sex !== undefined) updateParams.sex = input.sex;
      if (input.dob !== undefined) updateParams.dob = input.dob;
    } else {
      if (input.companyName !== undefined) updateParams.companyName = input.companyName;
      if (input.businessDescription !== undefined)
        updateParams.businessDescription = input.businessDescription;
    }
  }

  // Common fields
  if (input.govIdType !== undefined) updateParams.govIdType = input.govIdType;
  if (input.govIdNumber !== undefined) updateParams.govIdNumber = input.govIdNumber;
  if (input.phone !== undefined) updateParams.phone = input.phone;
  if (input.email !== undefined) updateParams.email = input.email;
  if (input.status !== undefined) updateParams.status = input.status;

  // 9. Recompute name if needed
  const needsNameRecompute =
    isTypeChanging ||
    (finalClientType === 'individual' &&
      (input.firstName !== undefined || input.lastName !== undefined)) ||
    (finalClientType === 'business' && input.companyName !== undefined);

  if (needsNameRecompute) {
    const firstName =
      updateParams.firstName !== undefined ? updateParams.firstName : existing.firstName;
    const lastName =
      updateParams.lastName !== undefined ? updateParams.lastName : existing.lastName;
    const companyName =
      updateParams.companyName !== undefined ? updateParams.companyName : existing.companyName;

    updateParams.name =
      finalClientType === 'individual'
        ? normalizeName(`${firstName ?? ''} ${lastName ?? ''}`)
        : normalizeName(companyName ?? '');
  }

  // 10. Update
  const updated = await updateClient(clientId, ctx.organizationId, updateParams);

  // 11. Audit log with before/after
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.CLIENT_UPDATE,
    entityType: 'client',
    entityId: clientId,
    changes: {
      before: {
        clientType: existing.clientType,
        name: existing.name,
        email: existing.email,
        status: existing.status,
      },
      after: {
        clientType: updated.clientType,
        name: updated.name,
        email: updated.email,
        status: updated.status,
      },
    },
  });

  serviceLogger.info({ clientId: updated.clientId, requestId: ctx.requestId }, 'Client updated');

  // 12. Re-fetch to get full data with account info
  const client = await findClientById(clientId, ctx.organizationId);
  if (!client) {
    throw new NotFoundError(CLIENT_ERRORS.CLIENT_NOT_FOUND);
  }

  return mapClient(client);
};

// =============================================================================
// List Clients
// =============================================================================

export const listClientsService = async (
  query: ListClientsQuery,
  ctx: ClientContext
): Promise<ListClientsResponse> => {
  const result = await listClients({
    organizationId: ctx.organizationId,
    page: query.page,
    limit: query.limit,
    clientType: query.clientType,
    status: query.status,
    accountName: query.accountName,
    firstName: query.firstName,
    lastName: query.lastName,
    companyName: query.companyName,
    search: query.search,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });

  return {
    clients: result.clients.map(mapClient),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
    },
  };
};

// =============================================================================
// Get Client
// =============================================================================

export const getClientService = async (clientId: string, ctx: ClientContext): Promise<Client> => {
  const client = await findClientById(clientId, ctx.organizationId);

  if (!client) {
    throw new NotFoundError(CLIENT_ERRORS.CLIENT_NOT_FOUND);
  }

  return mapClient(client);
};

// =============================================================================
// Delete Client
// =============================================================================

export const deleteClientService = async (clientId: string, ctx: ClientContext): Promise<void> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find client
  const client = await findClientById(clientId, ctx.organizationId);
  if (!client) {
    throw new NotFoundError(CLIENT_ERRORS.CLIENT_NOT_FOUND);
  }

  // 2. Check for related data
  const hasData = await hasClientRelatedData(clientId, ctx.organizationId);
  if (hasData) {
    throw new ConflictError(CLIENT_ERRORS.CANNOT_DELETE_WITH_DATA);
  }

  // 3. Soft delete
  await softDeleteClient(clientId, ctx.organizationId);

  // 4. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.CLIENT_DELETE,
    entityType: 'client',
    entityId: clientId,
    metadata: {
      clientId: client.clientId,
      name: client.name,
    },
  });

  serviceLogger.info({ clientId: client.clientId, requestId: ctx.requestId }, 'Client deleted');
};
