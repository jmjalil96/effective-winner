import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../../errors/index.js';
import type { CreateRoleInput, UpdateRoleInput, SetRolePermissionsInput } from '@crm/shared';
import { extractRequestMeta, getValidated } from '../../lib/utils.js';
import {
  listPermissions,
  listRoles,
  getRole,
  createRoleService,
  updateRoleService,
  deleteRoleService,
  setRolePermissionsService,
  type RbacContext,
} from './service.js';

// =============================================================================
// Helper
// =============================================================================

const buildContext = (req: Request): RbacContext => {
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
// Permissions
// =============================================================================

export const listPermissionsHandler: RequestHandler = async (req, res, next) => {
  try {
    buildContext(req); // Validates auth, maintains pattern consistency
    const permissions = await listPermissions();

    res.json({ permissions });
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// Roles
// =============================================================================

export const listRolesHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const roles = await listRoles(ctx);

    res.json({ roles });
  } catch (err) {
    next(err);
  }
};

export const getRoleHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const role = await getRole((getValidated(req).params as { id: string }).id, ctx);

    res.json({ role });
  } catch (err) {
    next(err);
  }
};

export const createRoleHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as CreateRoleInput;
    const role = await createRoleService(input, ctx);

    res.status(201).json({ role });
  } catch (err) {
    next(err);
  }
};

export const updateRoleHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as UpdateRoleInput;
    const role = await updateRoleService(
      (getValidated(req).params as { id: string }).id,
      input,
      ctx
    );

    res.json({ role });
  } catch (err) {
    next(err);
  }
};

export const deleteRoleHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    await deleteRoleService((getValidated(req).params as { id: string }).id, ctx);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const setRolePermissionsHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as SetRolePermissionsInput;
    const role = await setRolePermissionsService(
      (getValidated(req).params as { id: string }).id,
      input,
      ctx
    );

    res.json({ role });
  } catch (err) {
    next(err);
  }
};
