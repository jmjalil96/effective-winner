import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../../errors/index.js';
import type { CreateClientInput, UpdateClientInput, ClientIdParam, ListClientsQuery } from '@crm/shared';
import { extractRequestMeta, getValidated } from '../../lib/utils.js';
import {
  createClientService,
  updateClientService,
  listClientsService,
  getClientService,
  deleteClientService,
  type ClientContext,
} from './service.js';

// =============================================================================
// Helper
// =============================================================================

const buildContext = (req: Request): ClientContext => {
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

export const createClientHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as CreateClientInput;
    const client = await createClientService(input, ctx);

    res.status(201).json({ client });
  } catch (err) {
    next(err);
  }
};

export const updateClientHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const { id } = getValidated(req).params as ClientIdParam;
    const input = getValidated(req).body as UpdateClientInput;
    const client = await updateClientService(id, input, ctx);

    res.json({ client });
  } catch (err) {
    next(err);
  }
};

export const listClientsHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const query = getValidated(req).query as ListClientsQuery;
    const result = await listClientsService(query, ctx);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getClientHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const { id } = getValidated(req).params as ClientIdParam;
    const client = await getClientService(id, ctx);

    res.json({ client });
  } catch (err) {
    next(err);
  }
};

export const deleteClientHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const { id } = getValidated(req).params as ClientIdParam;
    await deleteClientService(id, ctx);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
