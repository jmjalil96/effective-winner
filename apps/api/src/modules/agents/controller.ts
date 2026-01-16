import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../../errors/index.js';
import type { CreateAgentInput, UpdateAgentInput, ListAgentsQuery } from '@crm/shared';
import { extractRequestMeta, getValidated } from '../../lib/utils.js';
import {
  createAgentService,
  getAgentService,
  updateAgentService,
  listAgentsService,
  deleteAgentService,
  type AgentContext,
} from './service.js';

// =============================================================================
// Helper
// =============================================================================

const buildContext = (req: Request): AgentContext => {
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

export const createAgentHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as CreateAgentInput;
    const agent = await createAgentService(input, ctx);

    res.status(201).json({ agent });
  } catch (err) {
    next(err);
  }
};

export const getAgentHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const agent = await getAgentService((getValidated(req).params as { id: string }).id, ctx);

    res.json({ agent });
  } catch (err) {
    next(err);
  }
};

export const updateAgentHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as UpdateAgentInput;
    const agent = await updateAgentService(
      (getValidated(req).params as { id: string }).id,
      input,
      ctx
    );

    res.json({ agent });
  } catch (err) {
    next(err);
  }
};

export const listAgentsHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const query = getValidated(req).query as ListAgentsQuery;
    const result = await listAgentsService(query, ctx);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const deleteAgentHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    await deleteAgentService((getValidated(req).params as { id: string }).id, ctx);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
