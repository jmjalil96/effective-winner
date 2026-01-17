import { Router, type Router as RouterType } from 'express';
import { validate, requireAuth, requirePermission } from '../../lib/middleware.js';
import { createClientSchema, updateClientSchema, clientIdParamSchema, listClientsQuerySchema } from '@crm/shared';
import {
  createClientHandler,
  updateClientHandler,
  listClientsHandler,
  getClientHandler,
  deleteClientHandler,
} from './controller.js';

const router: RouterType = Router();

router.get(
  '/',
  requireAuth,
  requirePermission('clients:read'),
  validate({ query: listClientsQuerySchema }),
  listClientsHandler
);

router.post(
  '/',
  requireAuth,
  requirePermission('clients:create'),
  validate({ body: createClientSchema }),
  createClientHandler
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('clients:update'),
  validate({ params: clientIdParamSchema, body: updateClientSchema }),
  updateClientHandler
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('clients:read'),
  validate({ params: clientIdParamSchema }),
  getClientHandler
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('clients:delete'),
  validate({ params: clientIdParamSchema }),
  deleteClientHandler
);

export { router as clientsRouter };
