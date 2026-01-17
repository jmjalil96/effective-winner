import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../../errors/index.js';
import type { CreateInsurerInput, UpdateInsurerInput, ListInsurersQuery } from '@crm/shared';
import { extractRequestMeta, getValidated } from '../../lib/utils.js';
import {
  createInsurerService,
  getInsurerService,
  updateInsurerService,
  listInsurersService,
  deleteInsurerService,
  type InsurerContext,
} from './service.js';

// =============================================================================
// Helper
// =============================================================================

const buildContext = (req: Request): InsurerContext => {
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

export const createInsurerHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as CreateInsurerInput;
    const insurer = await createInsurerService(input, ctx);

    res.status(201).json({ insurer });
  } catch (err) {
    next(err);
  }
};

export const getInsurerHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const insurer = await getInsurerService((getValidated(req).params as { id: string }).id, ctx);

    res.json({ insurer });
  } catch (err) {
    next(err);
  }
};

export const updateInsurerHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as UpdateInsurerInput;
    const insurer = await updateInsurerService(
      (getValidated(req).params as { id: string }).id,
      input,
      ctx
    );

    res.json({ insurer });
  } catch (err) {
    next(err);
  }
};

export const listInsurersHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const query = getValidated(req).query as ListInsurersQuery;
    const result = await listInsurersService(query, ctx);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteInsurerHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    await deleteInsurerService((getValidated(req).params as { id: string }).id, ctx);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
