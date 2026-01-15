import argon2 from 'argon2';
import crypto from 'node:crypto';

export const hashPassword = async (password: string): Promise<string> =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

export const verifyPassword = async (password: string, hash: string): Promise<boolean> =>
  argon2.verify(hash, password);

export const generateSessionId = (): string => crypto.randomBytes(32).toString('hex');

export const generateResetToken = (): string => crypto.randomBytes(32).toString('hex');

export const hashResetToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

// Timing-safe delay to prevent user enumeration
export const timingSafeDelay = async (): Promise<void> => {
  const baseDelay = 100;
  const jitter = crypto.randomInt(50);
  await new Promise((r) => setTimeout(r, baseDelay + jitter));
};
