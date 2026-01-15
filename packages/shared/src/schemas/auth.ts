import { z } from 'zod';

// Max 72 bytes - argon2 handles longer but this is a reasonable limit
const MAX_PASSWORD_LENGTH = 72;

export const loginSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters').max(MAX_PASSWORD_LENGTH),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(MAX_PASSWORD_LENGTH),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// Slug: lowercase alphanumeric + hyphens, 3-50 chars
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const registerSchema = z.object({
  organization: z.object({
    name: z.string().min(1, 'Organization name is required').max(255),
    slug: z
      .string()
      .min(3, 'Slug must be at least 3 characters')
      .max(50, 'Slug must be at most 50 characters')
      .regex(slugRegex, 'Slug must be lowercase alphanumeric with hyphens'),
  }),
  email: z.email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(MAX_PASSWORD_LENGTH),
  firstName: z.string().min(1, 'First name is required').max(255),
  lastName: z.string().min(1, 'Last name is required').max(255),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(255).optional(),
  lastName: z.string().min(1, 'Last name is required').max(255).optional(),
  phone: z.string().max(50).nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Route param validation
export const sessionIdParamSchema = z.object({
  id: z.uuid(),
});

export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;
