import { createChildLogger } from '../../../config/logger.js';
import { env } from '../../../config/env.js';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
} from '../../../errors/index.js';
import {
  logWithContext,
  AUDIT_ACTIONS,
  toAuditContext,
  type AuditContext,
  queueInvitationEmail,
} from '../../../lib/services/index.js';
import type {
  CreateInvitationInput,
  AcceptInvitationInput,
  CreateInvitationResponse,
  ListInvitationsResponse,
} from '@crm/shared';
import {
  findRoleById,
  checkPendingInvitation,
  createInvitation,
  findValidInvitationByToken,
  executeAcceptInvitation,
  getInviterInfo,
  findPendingInvitations,
  findInvitationById,
  revokeInvitationById,
} from '../repositories/invitations.repository.js';
import { checkEmailExists } from '../repositories/registration.repository.js';
import {
  hashPassword,
  generateResetToken,
  hashResetToken,
  timingSafeDelay,
} from '../../../lib/crypto.js';
import { INVITATION_EXPIRY_HOURS } from '../constants.js';

const serviceLogger = createChildLogger({ module: 'auth:invitations' });

// =============================================================================
// Create Invitation
// =============================================================================

export interface CreateInvitationContext {
  organizationId: string;
  organizationName: string;
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const createInvitationService = async (
  input: CreateInvitationInput,
  ctx: CreateInvitationContext
): Promise<CreateInvitationResponse> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Validate role exists and belongs to same org
  const role = await findRoleById(input.roleId);
  if (!role || role.organizationId !== ctx.organizationId) {
    throw new NotFoundError('Role not found');
  }

  // 2. Cannot invite to admin/default role
  if (role.isDefault) {
    throw new ForbiddenError('Cannot invite to admin role');
  }

  // 3. Check email doesn't exist globally
  const emailExists = await checkEmailExists(input.email);
  if (emailExists) {
    throw new ConflictError('Email already registered');
  }

  // 4. Check no pending invitation for this email in org
  const pendingExists = await checkPendingInvitation(ctx.organizationId, input.email);
  if (pendingExists) {
    throw new ConflictError('Invitation already pending');
  }

  // 5. Generate token
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

  // 6. Create invitation
  const { id: invitationId } = await createInvitation({
    organizationId: ctx.organizationId,
    email: input.email,
    roleId: input.roleId,
    invitedById: ctx.actorId,
    tokenHash,
    expiresAt,
  });

  // 7. Get inviter name for email
  const inviterInfo = await getInviterInfo(ctx.actorId);
  const inviterName = inviterInfo?.firstName ?? 'Your colleague';

  // 8. Queue invitation email (fire-and-forget)
  const inviteUrl = `${env.FRONTEND_URL}/accept-invitation?token=${token}`;

  queueInvitationEmail({
    to: input.email,
    inviterName,
    organizationName: ctx.organizationName,
    inviteUrl,
    expiresInDays: INVITATION_EXPIRY_HOURS / 24,
    roleName: role.name,
  }).catch((err: unknown) => {
    serviceLogger.error(
      { err, invitationId, requestId: ctx.requestId },
      'Failed to queue invitation email'
    );
  });

  // 9. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.INVITATION_CREATE,
    entityType: 'invitation',
    entityId: invitationId,
    metadata: { email: input.email, roleId: input.roleId, roleName: role.name },
  });

  // 10. Structured log
  serviceLogger.info(
    { invitationId, email: input.email, roleId: input.roleId, requestId: ctx.requestId },
    'Invitation created'
  );

  return {
    id: invitationId,
    email: input.email,
    role: { id: role.id, name: role.name },
    expiresAt: expiresAt.toISOString(),
  };
};

// =============================================================================
// Accept Invitation
// =============================================================================

export interface AcceptInvitationContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const acceptInvitation = async (
  input: AcceptInvitationInput,
  ctx: AcceptInvitationContext
): Promise<void> => {
  // Build audit context (no actor yet - new user)
  const auditCtx: AuditContext = {
    organizationId: null,
    actorId: null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  };

  // 1. Hash token and lookup
  const tokenHash = hashResetToken(input.token);
  const invitation = await findValidInvitationByToken(tokenHash);

  // 2. Invitation not found → timing-safe error
  if (!invitation) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired invitation');
  }

  // 3. Invitation expired
  if (invitation.expiresAt < new Date()) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired invitation');
  }

  // 4. Invitation already accepted
  if (invitation.acceptedAt) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired invitation');
  }

  // 5. Invitation revoked
  if (invitation.revokedAt) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired invitation');
  }

  // 6. Organization deleted
  if (invitation.organization.deletedAt) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired invitation');
  }

  // 7. Email registered after invitation (race condition)
  const emailExists = await checkEmailExists(invitation.email);
  if (emailExists) {
    throw new ConflictError('Email already registered');
  }

  // Update audit context
  auditCtx.organizationId = invitation.organization.id;

  // 8. Hash password
  const passwordHash = await hashPassword(input.password);

  // 9. Atomic: create user + profile + mark invitation accepted
  const result = await executeAcceptInvitation({
    invitationId: invitation.id,
    organizationId: invitation.organization.id,
    roleId: invitation.role.id,
    email: invitation.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
  });

  // Concurrent accept detected (invitation was accepted by another request)
  if (!result) {
    // This is actually fine - invitation is now accepted
    // Just return success (idempotent)
    return;
  }

  // Update audit context with new user ID
  auditCtx.actorId = result.userId;

  // 10. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.INVITATION_ACCEPT,
    entityType: 'invitation',
    entityId: invitation.id,
    metadata: {
      email: invitation.email,
      userId: result.userId,
      organizationId: invitation.organization.id,
    },
  });

  // 11. Structured log
  serviceLogger.info(
    {
      invitationId: invitation.id,
      userId: result.userId,
      organizationId: invitation.organization.id,
      requestId: ctx.requestId,
    },
    'Invitation accepted'
  );
};

// =============================================================================
// List Invitations
// =============================================================================

export interface ListInvitationsContext {
  organizationId: string;
  actorId: string;
  requestId: string | null;
}

export const listInvitations = async (
  ctx: ListInvitationsContext
): Promise<ListInvitationsResponse> => {
  const pendingInvitations = await findPendingInvitations(ctx.organizationId);

  serviceLogger.debug(
    {
      organizationId: ctx.organizationId,
      count: pendingInvitations.length,
      requestId: ctx.requestId,
    },
    'Listed pending invitations'
  );

  return {
    invitations: pendingInvitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      invitedBy: inv.invitedBy,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    })),
  };
};

// =============================================================================
// Revoke Invitation
// =============================================================================

export interface RevokeInvitationContext {
  organizationId: string;
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const revokeInvitationService = async (
  invitationId: string,
  ctx: RevokeInvitationContext
): Promise<void> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find invitation
  const invitation = await findInvitationById(invitationId);

  // 2. Not found
  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }

  // 3. Wrong organization
  if (invitation.organizationId !== ctx.organizationId) {
    throw new NotFoundError('Invitation not found');
  }

  // 4. Already accepted
  if (invitation.acceptedAt) {
    throw new ForbiddenError('Invitation has already been accepted');
  }

  // 5. Already revoked
  if (invitation.revokedAt) {
    throw new ForbiddenError('Invitation has already been revoked');
  }

  // 6. Already expired (treat as not found)
  if (invitation.expiresAt < new Date()) {
    throw new NotFoundError('Invitation not found');
  }

  // 7. Revoke
  await revokeInvitationById(invitationId);

  // 8. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.INVITATION_REVOKE,
    entityType: 'invitation',
    entityId: invitationId,
    metadata: { email: invitation.email },
  });

  serviceLogger.info(
    { invitationId, email: invitation.email, requestId: ctx.requestId },
    'Invitation revoked'
  );
};
