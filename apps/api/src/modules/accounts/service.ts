import { createChildLogger } from '../../config/logger.js';
import { NotFoundError } from '../../errors/index.js';
import { logWithContext, AUDIT_ACTIONS, toAuditContext } from '../../lib/services/index.js';
import type {
  CreateAccountInput,
  UpdateAccountInput,
  ListAccountsQuery,
  Account,
  ListAccountsResponse,
} from '@crm/shared';
import {
  getNextAccountId,
  findAgentById,
  findAccountById,
  createAccount,
  updateAccount,
  listAccounts,
  hasAccountRelatedData,
  softDeleteAccount,
} from './repository.js';
import { ACCOUNT_ERRORS } from './constants.js';
import { mapAccount } from './utils.js';
import { ConflictError } from '../../errors/index.js';

const serviceLogger = createChildLogger({ module: 'accounts' });

// =============================================================================
// Context Interfaces
// =============================================================================

export interface AccountContext {
  organizationId: string;
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

// =============================================================================
// Create Account
// =============================================================================

export const createAccountService = async (
  input: CreateAccountInput,
  ctx: AccountContext
): Promise<Account> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Validate agent exists and is not deleted
  const agent = await findAgentById(input.agentId, ctx.organizationId);
  if (!agent) {
    throw new NotFoundError(ACCOUNT_ERRORS.AGENT_NOT_FOUND);
  }

  // 2. Generate auto-incremented accountId (atomic)
  const accountId = await getNextAccountId(ctx.organizationId);

  // 3. Create account
  const created = await createAccount({
    organizationId: ctx.organizationId,
    accountId,
    agentId: input.agentId,
    name: input.name,
    status: input.status,
  });

  // 4. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.ACCOUNT_CREATE,
    entityType: 'account',
    entityId: created.id,
    metadata: {
      accountId: created.accountId,
      name: created.name,
      agentId: created.agentId,
    },
  });

  serviceLogger.info({ accountId: created.accountId, requestId: ctx.requestId }, 'Account created');

  // 5. Re-fetch to get full data with agent info
  const account = await findAccountById(created.id, ctx.organizationId);
  if (!account) {
    throw new NotFoundError(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
  }

  return mapAccount(account);
};

// =============================================================================
// Get Account
// =============================================================================

export const getAccountService = async (
  accountId: string,
  ctx: AccountContext
): Promise<Account> => {
  const account = await findAccountById(accountId, ctx.organizationId);

  if (!account) {
    throw new NotFoundError(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
  }

  return mapAccount(account);
};

// =============================================================================
// Update Account
// =============================================================================

export const updateAccountService = async (
  accountId: string,
  input: UpdateAccountInput,
  ctx: AccountContext
): Promise<Account> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find existing account
  const existing = await findAccountById(accountId, ctx.organizationId);
  if (!existing) {
    throw new NotFoundError(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
  }

  // 2. Validate agent if changing
  if (input.agentId && input.agentId !== existing.agentId) {
    const agent = await findAgentById(input.agentId, ctx.organizationId);
    if (!agent) {
      throw new NotFoundError(ACCOUNT_ERRORS.AGENT_NOT_FOUND);
    }
  }

  // 3. Check if anything to update (no-op handling)
  const hasChanges =
    input.agentId !== undefined || input.name !== undefined || input.status !== undefined;

  if (!hasChanges) {
    return mapAccount(existing);
  }

  // 4. Update
  const updated = await updateAccount(accountId, ctx.organizationId, input);

  // 5. Audit log with before/after
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.ACCOUNT_UPDATE,
    entityType: 'account',
    entityId: accountId,
    changes: {
      before: {
        agentId: existing.agentId,
        name: existing.name,
        status: existing.status,
      },
      after: {
        agentId: updated.agentId,
        name: updated.name,
        status: updated.status,
      },
    },
  });

  serviceLogger.info({ accountId: updated.accountId, requestId: ctx.requestId }, 'Account updated');

  // 6. Re-fetch to get full data with agent info
  const account = await findAccountById(accountId, ctx.organizationId);
  if (!account) {
    throw new NotFoundError(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
  }

  return mapAccount(account);
};

// =============================================================================
// List Accounts
// =============================================================================

export const listAccountsService = async (
  query: ListAccountsQuery,
  ctx: AccountContext
): Promise<ListAccountsResponse> => {
  const result = await listAccounts({
    organizationId: ctx.organizationId,
    page: query.page,
    limit: query.limit,
    status: query.status,
    agentName: query.agentName,
    search: query.search,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });

  return {
    accounts: result.accounts.map(mapAccount),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
    },
  };
};

// =============================================================================
// Delete Account
// =============================================================================

export const deleteAccountService = async (
  accountId: string,
  ctx: AccountContext
): Promise<void> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find account
  const account = await findAccountById(accountId, ctx.organizationId);
  if (!account) {
    throw new NotFoundError(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
  }

  // 2. Check for related data
  const hasData = await hasAccountRelatedData(accountId, ctx.organizationId);
  if (hasData) {
    throw new ConflictError(ACCOUNT_ERRORS.CANNOT_DELETE_WITH_DATA);
  }

  // 3. Soft delete
  await softDeleteAccount(accountId, ctx.organizationId);

  // 4. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.ACCOUNT_DELETE,
    entityType: 'account',
    entityId: accountId,
    metadata: {
      accountId: account.accountId,
      name: account.name,
    },
  });

  serviceLogger.info({ accountId: account.accountId, requestId: ctx.requestId }, 'Account deleted');
};
