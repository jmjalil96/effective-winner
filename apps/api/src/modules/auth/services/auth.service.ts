import { createChildLogger } from '../../../config/logger.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  EmailNotVerifiedError,
} from '../../../errors/index.js';
import {
  logWithContext,
  AUDIT_ACTIONS,
  toAuditContext,
  type AuditContext,
  queueAccountLockedEmail,
} from '../../../lib/services/index.js';
import type {
  LoginInput,
  AuthUser,
  LoginResponse,
  UpdateProfileInput,
  UpdateProfileResponse,
} from '@crm/shared';
import {
  findUserByEmail,
  findUserById,
  incrementFailedAttempts,
  resetLoginStateAndCreateSession,
  getUserPermissions,
  updateUserProfile,
} from '../repositories/users.repository.js';
import { verifyPassword, generateSessionId, timingSafeDelay } from '../../../lib/crypto.js';
import { hashSessionId, deleteSession } from '../../../lib/session.js';
import {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES,
  SESSION_DURATION_HOURS,
  REMEMBER_ME_DURATION_DAYS,
} from '../constants.js';

const serviceLogger = createChildLogger({ module: 'auth:service' });

// =============================================================================
// Login
// =============================================================================

export interface LoginContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface LoginResult {
  response: LoginResponse;
  sessionId: string;
  maxAgeMs: number;
}

export const login = async (input: LoginInput, ctx: LoginContext): Promise<LoginResult> => {
  const { password, rememberMe } = input;
  // Normalize email defensively (Zod already does this, but service should be self-contained)
  const email = input.email.toLowerCase().trim();

  // Build audit context (no actor yet - not authenticated)
  const auditCtx: AuditContext = {
    organizationId: null,
    actorId: null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  };

  // 1. Find user
  const user = await findUserByEmail(email);

  // 2. User not found or soft-deleted → timing-safe generic error
  if (!user || user.deletedAt || user.organization.deletedAt) {
    await timingSafeDelay();
    logWithContext(auditCtx, {
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      metadata: { email, reason: 'user_not_found' },
    });
    throw new UnauthorizedError('Invalid email or password');
  }

  // Update audit context with org info
  auditCtx.organizationId = user.organization.id;

  // 3. Check lockout (before argon2 to save compute)
  // Return generic error to avoid leaking account existence
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remainingMs = user.lockedUntil.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    await timingSafeDelay();
    logWithContext(auditCtx, {
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      metadata: { reason: 'account_locked', remainingMin },
    });
    throw new UnauthorizedError('Invalid email or password');
  }

  // 4. No password hash (OAuth-only account)
  if (!user.passwordHash) {
    await timingSafeDelay();
    logWithContext(auditCtx, {
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      metadata: { reason: 'no_password' },
    });
    throw new UnauthorizedError('Invalid email or password');
  }

  // 5. Verify password
  const passwordValid = await verifyPassword(password, user.passwordHash);

  if (!passwordValid) {
    // Increment failed attempts
    const newAttempts = user.failedLoginAttempts + 1;
    const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;
    const lockUntil = shouldLock
      ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
      : null;

    await incrementFailedAttempts(user.id, lockUntil);

    logWithContext(auditCtx, {
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      metadata: {
        reason: 'invalid_password',
        attempts: newAttempts,
        locked: shouldLock,
      },
    });

    if (shouldLock) {
      serviceLogger.warn({ userId: user.id }, 'Account locked due to failed attempts');

      queueAccountLockedEmail({
        to: user.email,
        firstName: user.profile?.firstName ?? 'User',
        lockReason: 'Too many failed login attempts',
        unlockAt: lockUntil?.toISOString(),
        supportEmail: 'support@example.com',
        orgName: user.organization.name,
      }).catch((err: unknown) => {
        serviceLogger.error(
          { err, userId: user.id, requestId: ctx.requestId },
          'Failed to queue account locked email'
        );
      });
    }

    throw new UnauthorizedError('Invalid email or password');
  }

  // 6. Check email verified (only after password verified)
  if (!user.emailVerifiedAt) {
    logWithContext(auditCtx, {
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      metadata: { reason: 'email_not_verified' },
    });
    throw new EmailNotVerifiedError();
  }

  // 7. Check account active (only after password verified)
  if (!user.isActive) {
    logWithContext(auditCtx, {
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      metadata: { reason: 'account_inactive' },
    });
    throw new ForbiddenError('Account has been deactivated');
  }

  // 8. Calculate session duration
  const durationHours = rememberMe ? REMEMBER_ME_DURATION_DAYS * 24 : SESSION_DURATION_HOURS;
  const maxAgeMs = durationHours * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + maxAgeMs);

  // 9. Generate session credentials
  const sessionId = generateSessionId();
  const sidHash = hashSessionId(sessionId);

  // 10. Atomically reset login state and create session
  await resetLoginStateAndCreateSession({
    userId: user.id,
    sidHash,
    organizationId: user.organization.id,
    expiresAt,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // 11. Load permissions
  const userPermissions = await getUserPermissions(user.role.id);

  // 12. Update audit context with actor (now authenticated)
  auditCtx.actorId = user.id;

  // 13. Audit log success
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.AUTH_LOGIN,
    entityType: 'user',
    entityId: user.id,
  });

  serviceLogger.info(
    { userId: user.id, organizationId: user.organization.id, requestId: ctx.requestId },
    'User logged in'
  );

  // 14. Build response
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    profile: user.profile ?? { firstName: '', lastName: '', phone: null },
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
    },
    role: {
      id: user.role.id,
      name: user.role.name,
    },
  };

  return {
    response: { user: authUser, permissions: userPermissions },
    sessionId,
    maxAgeMs,
  };
};

// =============================================================================
// Get Me
// =============================================================================

export interface MeContext {
  userId: string;
  roleId: string;
}

export const getMe = async (ctx: MeContext): Promise<LoginResponse> => {
  const user = await findUserById(ctx.userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const permissions = await getUserPermissions(ctx.roleId);

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    profile: user.profile ?? { firstName: '', lastName: '', phone: null },
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
    },
    role: {
      id: user.role.id,
      name: user.role.name,
    },
  };

  return { user: authUser, permissions };
};

// =============================================================================
// Logout
// =============================================================================

export interface LogoutContext {
  sessionId: string;
  userId: string;
  organizationId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const logout = async (ctx: LogoutContext): Promise<void> => {
  const auditCtx = toAuditContext({ ...ctx, actorId: ctx.userId });

  await deleteSession(ctx.sessionId);

  // Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.AUTH_LOGOUT,
    entityType: 'session',
    entityId: ctx.sessionId,
  });

  serviceLogger.info(
    { userId: ctx.userId, sessionId: ctx.sessionId, requestId: ctx.requestId },
    'User logged out'
  );
};

// =============================================================================
// Update Profile
// =============================================================================

export interface UpdateProfileContext {
  userId: string;
  organizationId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const updateProfile = async (
  input: UpdateProfileInput,
  ctx: UpdateProfileContext
): Promise<UpdateProfileResponse> => {
  const auditCtx = toAuditContext({ ...ctx, actorId: ctx.userId });

  // 1. Update profile
  const profile = await updateUserProfile(ctx.userId, {
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
  });

  // 2. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.USER_UPDATE,
    entityType: 'profile',
    entityId: ctx.userId,
    changes: {
      after: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
      },
    },
  });

  serviceLogger.info({ userId: ctx.userId, requestId: ctx.requestId }, 'Profile updated');

  return { profile };
};
