import 'dotenv/config';
import { z } from 'zod';

// Matches: "email@domain.com" or "Name <email@domain.com>"
const SMTP_FROM_REGEX = /^(?:[^<]+<)?[^\s@]+@[^\s@]+\.[^\s@]+>?$/;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // SMTP Configuration
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(2525),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z
    .string()
    .default('CRM <noreply@crm.local>')
    .refine((v) => SMTP_FROM_REGEX.test(v), {
      message: 'SMTP_FROM must be a valid email or "Name <email>" format',
    }),

  // Frontend URL for password reset links
  FRONTEND_URL: z.url().default('http://localhost:5174'),
});

export const env = envSchema.parse(process.env);
