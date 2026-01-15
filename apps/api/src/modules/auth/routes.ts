import { Router, type Router as RouterType } from 'express';
import { validate, requireAuth, requirePermission } from '../../lib/middleware.js';
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  createInvitationSchema,
  acceptInvitationSchema,
  updateProfileSchema,
  invitationIdParamSchema,
  sessionIdParamSchema,
} from '@crm/shared';
import {
  loginHandler,
  meHandler,
  logoutHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  changePasswordHandler,
  registerHandler,
  verifyEmailHandler,
  resendVerificationHandler,
  createInvitationHandler,
  acceptInvitationHandler,
  listSessionsHandler,
  revokeSessionHandler,
  revokeAllSessionsHandler,
  updateProfileHandler,
  listInvitationsHandler,
  revokeInvitationHandler,
} from './controller.js';

const router: RouterType = Router();

router.post('/login', validate({ body: loginSchema }), loginHandler);
router.get('/me', requireAuth, meHandler);
router.post('/logout', requireAuth, logoutHandler);
router.post('/forgot-password', validate({ body: forgotPasswordSchema }), forgotPasswordHandler);
router.post('/reset-password', validate({ body: resetPasswordSchema }), resetPasswordHandler);
router.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  changePasswordHandler
);
router.post('/register', validate({ body: registerSchema }), registerHandler);
router.post('/verify-email', validate({ body: verifyEmailSchema }), verifyEmailHandler);
router.post(
  '/resend-verification',
  validate({ body: resendVerificationSchema }),
  resendVerificationHandler
);
router.post(
  '/invite',
  requireAuth,
  requirePermission('invitations:create'),
  validate({ body: createInvitationSchema }),
  createInvitationHandler
);
router.post(
  '/accept-invitation',
  validate({ body: acceptInvitationSchema }),
  acceptInvitationHandler
);
router.get('/sessions', requireAuth, listSessionsHandler);
router.delete(
  '/sessions/:id',
  requireAuth,
  validate({ params: sessionIdParamSchema }),
  revokeSessionHandler
);
router.delete('/sessions', requireAuth, revokeAllSessionsHandler);

// Profile
router.patch(
  '/profile',
  requireAuth,
  validate({ body: updateProfileSchema }),
  updateProfileHandler
);

// Invitations
router.get(
  '/invitations',
  requireAuth,
  requirePermission('invitations:read'),
  listInvitationsHandler
);
router.delete(
  '/invitations/:id',
  requireAuth,
  requirePermission('invitations:delete'),
  validate({ params: invitationIdParamSchema }),
  revokeInvitationHandler
);

export { router as authRouter };
