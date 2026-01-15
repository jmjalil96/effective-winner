// Login/lockout
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

// Session
export const SESSION_DURATION_HOURS = 24;
export const REMEMBER_ME_DURATION_DAYS = 30;
export const SESSION_COOKIE_NAME = 'sid';
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
} as const;

// Tokens
export const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1;
export const EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
export const INVITATION_EXPIRY_HOURS = 48;
