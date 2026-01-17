import { Router, type Router as RouterType } from 'express';
import { validate, requireAuth, requirePermission } from '../../lib/middleware.js';
import {
  createInsurerSchema,
  insurerIdParamSchema,
  updateInsurerSchema,
  listInsurersQuerySchema,
} from '@crm/shared';
import {
  createInsurerHandler,
  getInsurerHandler,
  updateInsurerHandler,
  listInsurersHandler,
  deleteInsurerHandler,
} from './controller.js';

const router: RouterType = Router();

router.post(
  '/',
  requireAuth,
  requirePermission('insurers:create'),
  validate({ body: createInsurerSchema }),
  createInsurerHandler
);

router.get(
  '/',
  requireAuth,
  requirePermission('insurers:read'),
  validate({ query: listInsurersQuerySchema }),
  listInsurersHandler
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('insurers:read'),
  validate({ params: insurerIdParamSchema }),
  getInsurerHandler
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('insurers:update'),
  validate({ params: insurerIdParamSchema, body: updateInsurerSchema }),
  updateInsurerHandler
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('insurers:delete'),
  validate({ params: insurerIdParamSchema }),
  deleteInsurerHandler
);

export { router as insurersRouter };
