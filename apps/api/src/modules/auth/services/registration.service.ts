import { createChildLogger } from '../../../config/logger.js';
import { env } from '../../../config/env.js';
import { ConflictError, UnauthorizedError } from '../../../errors/index.js';
import {
  logWithContext,
  AUDIT_ACTIONS,
  type AuditContext,
  queueEmailVerificationEmail,
} from '../../../lib/services/index.js';
import type {
  RegisterInput,
  VerifyEmailInput,
  ResendVerificationInput,
  ResendVerificationResponse,
} from '@crm/shared';
import {
  checkEmailExists,
  checkSlugExists,
  createOrganizationWithAdmin,
  createEmailVerificationToken,
  findValidEmailVerificationToken,
  executeEmailVerification,
  findUserForResendVerification,
} from '../repositories/registration.repository.js';
import {
  hashPassword,
  generateResetToken,
  hashResetToken,
  timingSafeDelay,
} from '../../../lib/crypto.js';
import { EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS } from '../constants.js';

const serviceLogger = createChildLogger({ module: 'auth:registration' });

// =============================================================================
// Register
// =============================================================================

export interface RegisterContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const register = async (input: RegisterInput, ctx: RegisterContext): Promise<void> => {
  // Build audit context (no actor yet - new user)
  const auditCtx: AuditContext = {
    organizationId: null,
    actorId: null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  };

  // 1. Check email uniqueness
  const emailExists = await checkEmailExists(input.email);
  if (emailExists) {
    throw new ConflictError('Email or organization slug already in use');
  }

  // 2. Check slug uniqueness
  const slugExists = await checkSlugExists(input.organization.slug);
  if (slugExists) {
    throw new ConflictError('Email or organization slug already in use');
  }

  // 3. Hash password
  const passwordHash = await hashPassword(input.password);

  // 4. Create organization, role, user, profile (atomic)
  const { organizationId, userId, roleId } = await createOrganizationWithAdmin({
    organization: {
      name: input.organization.name,
      slug: input.organization.slug,
    },
    user: {
      email: input.email,
      passwordHash,
    },
    profile: {
      firstName: input.firstName,
      lastName: input.lastName,
    },
  });

  // 5. Update audit context with new IDs
  auditCtx.organizationId = organizationId;
  auditCtx.actorId = userId;

  // 6. Audit log organization creation
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.ORG_CREATE,
    entityType: 'organization',
    entityId: organizationId,
    metadata: { name: input.organization.name, slug: input.organization.slug },
  });

  // 7. Audit log role creation
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.ROLE_CREATE,
    entityType: 'role',
    entityId: roleId,
    metadata: { name: 'Admin', isDefault: true },
  });

  // 8. Audit log user creation
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.USER_CREATE,
    entityType: 'user',
    entityId: userId,
    metadata: { email: input.email },
  });

  // 9. Generate verification token
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // 10. Store verification token
  await createEmailVerificationToken({
    userId,
    tokenHash,
    expiresAt,
  });

  // 11. Queue verification email (fire-and-forget)
  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;

  queueEmailVerificationEmail({
    to: input.email,
    firstName: input.firstName,
    verifyUrl,
    expiresInHours: EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS,
    orgName: input.organization.name,
  }).catch((err: unknown) => {
    serviceLogger.error(
      { err, userId, requestId: ctx.requestId },
      'Failed to queue verification email'
    );
  });

  // 12. Structured log
  serviceLogger.info(
    { userId, organizationId, requestId: ctx.requestId },
    'Organization registered'
  );
};

// =============================================================================
// Verify Email
// =============================================================================

export interface VerifyEmailContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const verifyEmail = async (
  input: VerifyEmailInput,
  ctx: VerifyEmailContext
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
  const tokenData = await findValidEmailVerificationToken(tokenHash);

  // 2. Token not found → timing-safe error
  if (!tokenData) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired verification token');
  }

  // 3. Token expired
  if (tokenData.expiresAt < new Date()) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired verification token');
  }

  // 4. Token already used
  if (tokenData.usedAt) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired verification token');
  }

  // 5. User or org deleted
  if (tokenData.user.deletedAt || tokenData.user.organization.deletedAt) {
    await timingSafeDelay();
    throw new UnauthorizedError('Invalid or expired verification token');
  }

  // 6. User already verified (idempotent success)
  if (tokenData.user.emailVerifiedAt) {
    // Already verified - just return success (don't leak info)
    return;
  }

  // Update audit context
  auditCtx.organizationId = tokenData.user.organization.id;
  auditCtx.actorId = tokenData.userId;

  // 7. Atomically: mark token used + set emailVerifiedAt
  const success = await executeEmailVerification({
    tokenId: tokenData.id,
    userId: tokenData.userId,
  });

  // Concurrent verification detected (token was used by another request)
  if (!success) {
    // This is actually fine - email is now verified
    // Just return success (idempotent)
    return;
  }

  // 8. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.AUTH_EMAIL_VERIFY,
    entityType: 'user',
    entityId: tokenData.userId,
  });

  serviceLogger.info({ userId: tokenData.userId, requestId: ctx.requestId }, 'Email verified');
};

// =============================================================================
// Resend Verification
// =============================================================================

export interface ResendVerificationContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const resendVerification = async (
  input: ResendVerificationInput,
  ctx: ResendVerificationContext
): Promise<ResendVerificationResponse> => {
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
  const user = await findUserForResendVerification(email);

  // 2. User not found → generic success (no info leak)
  if (!user || user.deletedAt || user.organization.deletedAt) {
    await timingSafeDelay();
    return {
      sent: true,
      alreadyVerified: false,
      message: 'If this email is registered and unverified, a verification email has been sent.',
    };
  }

  // 3. User already verified → generic response (don't reveal account status)
  if (user.emailVerifiedAt) {
    await timingSafeDelay();
    return {
      sent: true,
      alreadyVerified: false,
      message: 'If this email is registered and unverified, a verification email has been sent.',
    };
  }

  // 4. User not active → generic success (don't reveal account state)
  if (!user.isActive) {
    await timingSafeDelay();
    return {
      sent: true,
      alreadyVerified: false,
      message: 'If this email is registered and unverified, a verification email has been sent.',
    };
  }

  // Update audit context
  auditCtx.organizationId = user.organization.id;
  auditCtx.actorId = user.id;

  // 5. Generate new verification token
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // 6. Invalidate old tokens + create new (atomic)
  await createEmailVerificationToken({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // 7. Queue verification email (fire-and-forget)
  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;

  queueEmailVerificationEmail({
    to: user.email,
    firstName: user.profile?.firstName ?? 'User',
    verifyUrl,
    expiresInHours: EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS,
    orgName: user.organization.name,
  }).catch((err: unknown) => {
    serviceLogger.error(
      { err, userId: user.id, requestId: ctx.requestId },
      'Failed to queue verification email'
    );
  });

  // 8. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.AUTH_EMAIL_VERIFY_RESEND,
    entityType: 'user',
    entityId: user.id,
  });

  // 9. Structured log
  serviceLogger.info({ userId: user.id, requestId: ctx.requestId }, 'Verification email resent');

  return {
    sent: true,
    alreadyVerified: false,
    message: 'Verification email sent. Please check your inbox and spam folder.',
  };
};
