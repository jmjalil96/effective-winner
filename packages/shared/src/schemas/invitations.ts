import { z } from 'zod';

// Max 72 bytes - argon2 handles longer but this is a reasonable limit
const MAX_PASSWORD_LENGTH = 72;

export const createInvitationSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
  roleId: z.uuid(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(MAX_PASSWORD_LENGTH),
  firstName: z.string().min(1, 'First name is required').max(255),
  lastName: z.string().min(1, 'Last name is required').max(255),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const invitationIdParamSchema = z.object({
  id: z.uuid(),
});

export type InvitationIdParam = z.infer<typeof invitationIdParamSchema>;
