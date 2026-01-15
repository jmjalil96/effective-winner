import { Router, type Router as RouterType } from 'express';
import { validate, requireAuth, requirePermission } from '../../lib/middleware.js';
import {
  createRoleSchema,
  updateRoleSchema,
  setRolePermissionsSchema,
  roleIdParamSchema,
} from '@crm/shared';
import {
  listPermissionsHandler,
  listRolesHandler,
  getRoleHandler,
  createRoleHandler,
  updateRoleHandler,
  deleteRoleHandler,
  setRolePermissionsHandler,
} from './controller.js';

const router: RouterType = Router();

// Permissions
router.get('/permissions', requireAuth, requirePermission('roles:read'), listPermissionsHandler);

// Roles
router.get('/roles', requireAuth, requirePermission('roles:read'), listRolesHandler);

router.post(
  '/roles',
  requireAuth,
  requirePermission('roles:write'),
  validate({ body: createRoleSchema }),
  createRoleHandler
);

router.get(
  '/roles/:id',
  requireAuth,
  requirePermission('roles:read'),
  validate({ params: roleIdParamSchema }),
  getRoleHandler
);

router.patch(
  '/roles/:id',
  requireAuth,
  requirePermission('roles:write'),
  validate({ params: roleIdParamSchema, body: updateRoleSchema }),
  updateRoleHandler
);

router.delete(
  '/roles/:id',
  requireAuth,
  requirePermission('roles:delete'),
  validate({ params: roleIdParamSchema }),
  deleteRoleHandler
);

router.put(
  '/roles/:id/permissions',
  requireAuth,
  requirePermission('roles:write'),
  validate({ params: roleIdParamSchema, body: setRolePermissionsSchema }),
  setRolePermissionsHandler
);

export { router as rbacRouter };
