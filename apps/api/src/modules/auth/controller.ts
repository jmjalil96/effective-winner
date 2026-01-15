import type { RequestHandler } from 'express';
import type {
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  RegisterInput,
  VerifyEmailInput,
  ResendVerificationInput,
  CreateInvitationInput,
  AcceptInvitationInput,
  UpdateProfileInput,
  InvitationIdParam,
} from '@crm/shared';
import { extractRequestMeta } from '../../lib/utils.js';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from './constants.js';
import {
  login,
  getMe,
  logout,
  updateProfile,
  type LoginContext,
  type MeContext,
  type LogoutContext,
  type UpdateProfileContext,
} from './services/auth.service.js';
import {
  forgotPassword,
  resetPassword,
  changePassword,
  type ForgotPasswordContext,
  type ResetPasswordContext,
  type ChangePasswordContext,
} from './services/password.service.js';
import {
  register,
  verifyEmail,
  resendVerification,
  type RegisterContext,
  type VerifyEmailContext,
  type ResendVerificationContext,
} from './services/registration.service.js';
import {
  createInvitationService,
  acceptInvitation,
  listInvitations,
  revokeInvitationService,
  type CreateInvitationContext,
  type AcceptInvitationContext,
  type ListInvitationsContext,
  type RevokeInvitationContext,
} from './services/invitations.service.js';
import {
  listSessions,
  revokeSession,
  revokeAllOtherSessionsService,
  type ListSessionsContext,
  type RevokeSessionContext,
  type RevokeAllSessionsContext,
} from './services/sessions.service.js';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../errors/index.js';

export const loginHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = req.body as LoginInput;
    const ctx: LoginContext = extractRequestMeta(req);
    const { response, sessionId, maxAgeMs } = await login(input, ctx);

    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      ...SESSION_COOKIE_OPTIONS,
      secure: env.NODE_ENV === 'production',
      maxAge: maxAgeMs,
    });

    res.json(response);
  } catch (err) {
    next(err);
  }
};

export const meHandler: RequestHandler = async (req, res, next) => {
  try {
    // req.ctx guaranteed by requireAuth middleware, but check defensively
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    const ctx: MeContext = {
      userId: req.ctx.user.id,
      roleId: req.ctx.role.id,
    };

    const response = await getMe(ctx);
    res.json(response);
  } catch (err) {
    next(err);
  }
};

export const logoutHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    const ctx: LogoutContext = {
      sessionId: req.ctx.session.id,
      userId: req.ctx.user.id,
      organizationId: req.ctx.organization.id,
      ...extractRequestMeta(req),
    };

    await logout(ctx);

    res.clearCookie(SESSION_COOKIE_NAME, {
      ...SESSION_COOKIE_OPTIONS,
      secure: env.NODE_ENV === 'production',
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const forgotPasswordHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = req.body as ForgotPasswordInput;
    const ctx: ForgotPasswordContext = extractRequestMeta(req);

    await forgotPassword(input, ctx);

    res.status(200).json({ message: 'If an account exists, a reset email has been sent' });
  } catch (err) {
    next(err);
  }
};

export const resetPasswordHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = req.body as ResetPasswordInput;
    const ctx: ResetPasswordContext = extractRequestMeta(req);

    await resetPassword(input, ctx);

    res.status(200).json({ message: 'Password has been reset successfully' });
  } catch (err) {
    next(err);
  }
};

export const changePasswordHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    const input = req.body as ChangePasswordInput;

    const ctx: ChangePasswordContext = {
      userId: req.ctx.user.id,
      sessionId: req.ctx.session.id,
      organizationId: req.ctx.organization.id,
      ...extractRequestMeta(req),
    };

    await changePassword(input, ctx);

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

export const registerHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = req.body as RegisterInput;
    const ctx: RegisterContext = extractRequestMeta(req);

    await register(input, ctx);

    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
    });
  } catch (err) {
    next(err);
  }
};

export const verifyEmailHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = req.body as VerifyEmailInput;
    const ctx: VerifyEmailContext = extractRequestMeta(req);

    await verifyEmail(input, ctx);

    res.status(200).json({
      message: 'Email verified successfully. You can now log in.',
    });
  } catch (err) {
    next(err);
  }
};

export const resendVerificationHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = req.body as ResendVerificationInput;
    const ctx: ResendVerificationContext = extractRequestMeta(req);

    const result = await resendVerification(input, ctx);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const createInvitationHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    const input = req.body as CreateInvitationInput;

    const ctx: CreateInvitationContext = {
      organizationId: req.ctx.organization.id,
      organizationName: req.ctx.organization.name,
      actorId: req.ctx.user.id,
      ...extractRequestMeta(req),
    };

    const result = await createInvitationService(input, ctx);

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const acceptInvitationHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = req.body as AcceptInvitationInput;
    const ctx: AcceptInvitationContext = extractRequestMeta(req);

    await acceptInvitation(input, ctx);

    res.status(200).json({
      message: 'Account created successfully. You can now log in.',
    });
  } catch (err) {
    next(err);
  }
};

export const listSessionsHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    const ctx: ListSessionsContext = {
      userId: req.ctx.user.id,
      currentSessionId: req.ctx.session.id,
    };

    const sessions = await listSessions(ctx);

    res.json({ sessions });
  } catch (err) {
    next(err);
  }
};

export const revokeSessionHandler: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    const sessionId = req.params.id;

    const ctx: RevokeSessionContext = {
      userId: req.ctx.user.id,
      currentSessionId: req.ctx.session.id,
      organizationId: req.ctx.organization.id,
      ...extractRequestMeta(req),
    };

    await revokeSession(sessionId, ctx);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const revokeAllSessionsHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    const ctx: RevokeAllSessionsContext = {
      userId: req.ctx.user.id,
      currentSessionId: req.ctx.session.id,
      organizationId: req.ctx.organization.id,
      ...extractRequestMeta(req),
    };

    const result = await revokeAllOtherSessionsService(ctx);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const updateProfileHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    const input = req.body as UpdateProfileInput;

    const ctx: UpdateProfileContext = {
      userId: req.ctx.user.id,
      organizationId: req.ctx.organization.id,
      ...extractRequestMeta(req),
    };

    const result = await updateProfile(input, ctx);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const listInvitationsHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    const ctx: ListInvitationsContext = {
      organizationId: req.ctx.organization.id,
      actorId: req.ctx.user.id,
      requestId: extractRequestMeta(req).requestId,
    };

    const result = await listInvitations(ctx);

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const revokeInvitationHandler: RequestHandler<InvitationIdParam> = async (
  req,
  res,
  next
) => {
  try {
    if (!req.ctx) {
      throw new UnauthorizedError('Authentication required');
    }

    const invitationId = req.params.id;

    const ctx: RevokeInvitationContext = {
      organizationId: req.ctx.organization.id,
      actorId: req.ctx.user.id,
      ...extractRequestMeta(req),
    };

    await revokeInvitationService(invitationId, ctx);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
