import { Router, type Router as RouterType } from 'express';
import { validate, requireAuth, requirePermission } from '../../lib/middleware.js';
import {
  createAgentSchema,
  agentIdParamSchema,
  updateAgentSchema,
  listAgentsQuerySchema,
} from '@crm/shared';
import {
  createAgentHandler,
  getAgentHandler,
  updateAgentHandler,
  listAgentsHandler,
  deleteAgentHandler,
} from './controller.js';

const router: RouterType = Router();

router.post(
  '/',
  requireAuth,
  requirePermission('agents:create'),
  validate({ body: createAgentSchema }),
  createAgentHandler
);

router.get(
  '/',
  requireAuth,
  requirePermission('agents:read'),
  validate({ query: listAgentsQuerySchema }),
  listAgentsHandler
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('agents:read'),
  validate({ params: agentIdParamSchema }),
  getAgentHandler
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('agents:update'),
  validate({ params: agentIdParamSchema, body: updateAgentSchema }),
  updateAgentHandler
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('agents:delete'),
  validate({ params: agentIdParamSchema }),
  deleteAgentHandler
);

export { router as agentsRouter };
