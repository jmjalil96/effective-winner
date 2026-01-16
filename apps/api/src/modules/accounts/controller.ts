import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../../errors/index.js';
import type { CreateAccountInput, UpdateAccountInput, ListAccountsQuery } from '@crm/shared';
import { extractRequestMeta, getValidated } from '../../lib/utils.js';
import {
  createAccountService,
  getAccountService,
  updateAccountService,
  listAccountsService,
  deleteAccountService,
  type AccountContext,
} from './service.js';

// =============================================================================
// Helper
// =============================================================================

const buildContext = (req: Request): AccountContext => {
  if (!req.ctx) {
    throw new UnauthorizedError('Authentication required');
  }

  return {
    organizationId: req.ctx.organization.id,
    actorId: req.ctx.user.id,
    ...extractRequestMeta(req),
  };
};

// =============================================================================
// Handlers
// =============================================================================

export const createAccountHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as CreateAccountInput;
    const account = await createAccountService(input, ctx);

    res.status(201).json({ account });
  } catch (err) {
    next(err);
  }
};

export const getAccountHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const account = await getAccountService((getValidated(req).params as { id: string }).id, ctx);

    res.json({ account });
  } catch (err) {
    next(err);
  }
};

export const updateAccountHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as UpdateAccountInput;
    const account = await updateAccountService(
      (getValidated(req).params as { id: string }).id,
      input,
      ctx
    );

    res.json({ account });
  } catch (err) {
    next(err);
  }
};

export const listAccountsHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const query = getValidated(req).query as ListAccountsQuery;
    const result = await listAccountsService(query, ctx);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteAccountHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    await deleteAccountService((getValidated(req).params as { id: string }).id, ctx);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
