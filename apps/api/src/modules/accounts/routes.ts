import { Router, type Router as RouterType } from 'express';
import { validate, requireAuth, requirePermission } from '../../lib/middleware.js';
import {
  createAccountSchema,
  accountIdParamSchema,
  updateAccountSchema,
  listAccountsQuerySchema,
} from '@crm/shared';
import {
  createAccountHandler,
  getAccountHandler,
  updateAccountHandler,
  listAccountsHandler,
  deleteAccountHandler,
} from './controller.js';

const router: RouterType = Router();

router.post(
  '/',
  requireAuth,
  requirePermission('accounts:create'),
  validate({ body: createAccountSchema }),
  createAccountHandler
);

router.get(
  '/',
  requireAuth,
  requirePermission('accounts:read'),
  validate({ query: listAccountsQuerySchema }),
  listAccountsHandler
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('accounts:read'),
  validate({ params: accountIdParamSchema }),
  getAccountHandler
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('accounts:update'),
  validate({ params: accountIdParamSchema, body: updateAccountSchema }),
  updateAccountHandler
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('accounts:delete'),
  validate({ params: accountIdParamSchema }),
  deleteAccountHandler
);

export { router as accountsRouter };
