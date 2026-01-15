import { createChildLogger } from '../../../config/logger.js';
import { env } from '../../../config/env.js';
import { UnauthorizedError } from '../../../errors/index.js';
import {
  logWithContext,
  AUDIT_ACTIONS,
  toAuditContext,
  type AuditContext,
  queuePasswordResetEmail,
  queuePasswordChangedEmail,
} from '../../../lib/services/index.js';
import type { ForgotPasswordInput, ResetPasswordInput, ChangePasswordInput } from '@crm/shared';
import {
  findUserForPasswordReset,
  createPasswordResetToken,
  findValidResetToken,
  executePasswordReset,
  getUserForPasswordChange,
  executeChangePassword,
} from '../repositories/password.repository.js';
import {
  verifyPassword,
  hashPassword,
  generateResetToken,
  hashResetToken,
  timingSafeDelay,
} from '../../../lib/crypto.js';
import { PASSWORD_RESET_TOKEN_EXPIRY_HOURS } from '../constants.js';

const serviceLogger = createChildLogger({ module: 'auth:password' });

// =============================================================================
// Forgot Password
// =============================================================================

export interface ForgotPasswordContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const forgotPassword = async (
  input: ForgotPasswordInput,
  ctx: ForgotPasswordContext
): Promise<void> => {
  // Normalize email defensively
  const email = input.email.toLowerCase().trim();

  // Build audit context (no actor yet)
  const auditCtx: AuditContext = {
    organizationId: null,
    actorId: null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  };

  // 1. Find user
  const user = await findUserForPasswordReset(email);

  // 2. User not found or soft-deleted → timing-safe silent success
  if (!user || user.deletedAt || user.organization.deletedAt) {
    await timingSafeDelay();
    return; // Silent success - no info leak
  }

  // 3. User has no password → also silent success
  if (!user.passwordHash) {
    await timingSafeDelay();
    return;
  }

  // 4. User not active → silent success
  if (!user.isActive) {
    await timingSafeDelay();
    return;
  }

  // Update audit context
  auditCtx.organizationId = user.organization.id;
  auditCtx.actorId = user.id;

  // 5. Generate token
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // 6. Invalidate old tokens + create new (atomic)
  await createPasswordResetToken({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // 7. Queue email
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;

  queuePasswordResetEmail({
    to: user.email,
    firstName: user.profile?.firstName ?? 'User',
    resetUrl,
    expiresInHours: PASSWORD_RESET_TOKEN_EXPIRY_HOURS,
    orgName: user.organization.name,
  }).catch((err: unknown) => {
    serviceLogger.error(
      { err, userId: user.id, requestId: ctx.requestId },
      'Failed to queue password reset email'
    );
  });

  // 8. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUEST,
    entityType: 'user',
    entityId: user.id,
  });

  serviceLogger.info({ userId: user.id, requestId: ctx.requestId }, 'Password reset requested');
};

// =============================================================================
// Reset Password
// =============================================================================

export interface ResetPasswordContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const resetPassword = async (
  input: ResetPasswordInput,
  ctx: ResetPasswordContext
): Promise<void> => {
  // Build audit context (no actor yet)
  const auditCtx: AuditContext = {
    organizationId: null,
    actorId: null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  };

  // 1. Hash token and lookup
  const tokenHash = hashResetToken(input.token);
  const tokenData = await findValidResetToken(tokenHash);

  // 2. Token not found → timing-safe error
  if (!tokenData) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  // 3. Token expired
  if (tokenData.expiresAt < new Date()) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  // 4. Token already used
  if (tokenData.usedAt) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  // 5. User or org deleted
  if (tokenData.user.deletedAt || tokenData.user.organization.deletedAt) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  // 6. User not active
  if (!tokenData.user.isActive) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  // Update audit context
  auditCtx.organizationId = tokenData.user.organization.id;
  auditCtx.actorId = tokenData.userId;

  // 7. Hash new password
  const newPasswordHash = await hashPassword(input.password);

  // 8. Atomically: mark token used + update password + delete sessions
  const success = await executePasswordReset({
    tokenId: tokenData.id,
    userId: tokenData.userId,
    passwordHash: newPasswordHash,
  });

  // Concurrent reset detected - token already consumed by another request.
  // Unlike invitation acceptance, password reset is NOT idempotent:
  // tokens are single-use for security (prevents replay attacks).
  if (!success) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  // 9. Queue password changed notification
  queuePasswordChangedEmail({
    to: tokenData.user.email,
    firstName: tokenData.user.profile?.firstName ?? 'User',
    changedAt: new Date().toISOString(),
    ipAddress: ctx.ipAddress ?? undefined,
    orgName: tokenData.user.organization.name,
  }).catch((err: unknown) => {
    serviceLogger.error(
      { err, userId: tokenData.userId, requestId: ctx.requestId },
      'Failed to queue password changed email'
    );
  });

  // 10. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_COMPLETE,
    entityType: 'user',
    entityId: tokenData.userId,
  });

  serviceLogger.info(
    { userId: tokenData.userId, requestId: ctx.requestId },
    'Password reset completed'
  );
};

// =============================================================================
// Change Password
// =============================================================================

export interface ChangePasswordContext {
  userId: string;
  sessionId: string;
  organizationId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const changePassword = async (
  input: ChangePasswordInput,
  ctx: ChangePasswordContext
): Promise<void> => {
  const auditCtx = toAuditContext({ ...ctx, actorId: ctx.userId });

  // 1. Get user data for verification and email
  const user = await getUserForPasswordChange(ctx.userId);

  if (!user || !user.passwordHash) {
    // User doesn't exist or has no password (shouldn't happen for authenticated user)
    throw new UnauthorizedError('Unable to change password');
  }

  // 2. Verify current password
  const isValid = await verifyPassword(input.currentPassword, user.passwordHash);

  if (!isValid) {
    logWithContext(auditCtx, {
      action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGE,
      entityType: 'user',
      entityId: ctx.userId,
      metadata: { success: false, reason: 'invalid_current_password' },
    });

    throw new UnauthorizedError('Current password is incorrect');
  }

  // 3. Hash new password
  const newPasswordHash = await hashPassword(input.newPassword);

  // 4. Atomically: update password + revoke other sessions
  await executeChangePassword({
    userId: ctx.userId,
    passwordHash: newPasswordHash,
    currentSessionId: ctx.sessionId,
  });

  // 5. Queue password changed notification (fire-and-forget)
  queuePasswordChangedEmail({
    to: user.email,
    firstName: user.firstName ?? 'User',
    changedAt: new Date().toISOString(),
    ipAddress: ctx.ipAddress ?? undefined,
    orgName: user.organizationName,
  }).catch((err: unknown) => {
    serviceLogger.error(
      { err, userId: ctx.userId, requestId: ctx.requestId },
      'Failed to queue password changed email'
    );
  });

  // 6. Audit log success
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGE,
    entityType: 'user',
    entityId: ctx.userId,
  });

  serviceLogger.info({ userId: ctx.userId, requestId: ctx.requestId }, 'Password changed');
};
