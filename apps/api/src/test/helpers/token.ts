import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { getTestDb } from '../setup.js';
import { emailVerificationTokens, passwordResetTokens, users } from '../../db/schema.js';

// =============================================================================
// Token Generation
// =============================================================================

/**
 * Generate a verification token pair (raw + hashed).
 */
export const generateTestToken = (): { token: string; tokenHash: string } => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
};

/**
 * Hash a raw token (for lookups).
 */
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

// =============================================================================
// Token Creation
// =============================================================================

export interface CreateVerificationTokenOptions {
  /** User ID to create token for */
  userId: string;
  /** Expiration offset in ms (default: +24h, negative for expired) */
  expiresInMs?: number;
  /** Whether token should be marked as used (default: false) */
  used?: boolean;
}

export interface CreateVerificationTokenResult {
  /** Raw token to use in API requests */
  token: string;
  /** Hashed token stored in DB */
  tokenHash: string;
  /** Token record ID */
  tokenId: string;
  /** Token expiration date */
  expiresAt: Date;
}

/**
 * Create a verification token directly in DB.
 * Returns both raw token (for API) and hash (for verification).
 */
export const createVerificationToken = async (
  options: CreateVerificationTokenOptions
): Promise<CreateVerificationTokenResult> => {
  const db = getTestDb();
  const { token, tokenHash } = generateTestToken();
  const expiresAt = new Date(Date.now() + (options.expiresInMs ?? 24 * 60 * 60 * 1000));

  const [record] = await db
    .insert(emailVerificationTokens)
    .values({
      id: uuidv7(),
      userId: options.userId,
      tokenHash,
      expiresAt,
      usedAt: options.used ? new Date() : null,
    })
    .returning();

  if (!record) throw new Error('Failed to create verification token');

  return {
    token,
    tokenHash,
    tokenId: record.id,
    expiresAt,
  };
};

// =============================================================================
// Token Queries
// =============================================================================

/**
 * Get verification token by user ID.
 */
export const getVerificationTokenByUserId = async (userId: string) => {
  const db = getTestDb();
  const result = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId))
    .limit(1);
  return result[0] ?? null;
};

/**
 * Get verification token by token hash.
 */
export const getVerificationTokenByHash = async (tokenHash: string) => {
  const db = getTestDb();
  const result = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1);
  return result[0] ?? null;
};

/**
 * Get all verification tokens for a user.
 */
export const getAllVerificationTokensForUser = async (userId: string) => {
  const db = getTestDb();
  return db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId));
};

// =============================================================================
// User Queries for Verification Tests
// =============================================================================

/**
 * Get user by ID with email verification status.
 */
export const getUserById = async (userId: string) => {
  const db = getTestDb();
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] ?? null;
};

/**
 * Check if user email is verified.
 */
export const isUserEmailVerified = async (userId: string): Promise<boolean> => {
  const user = await getUserById(userId);
  return user?.emailVerifiedAt !== null;
};

/**
 * Mark user as deleted (for testing deleted user scenarios).
 */
export const markUserDeleted = async (userId: string): Promise<void> => {
  const db = getTestDb();
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
};

// =============================================================================
// Password Reset Token Creation
// =============================================================================

export interface CreatePasswordResetTokenOptions {
  /** User ID to create token for */
  userId: string;
  /** Expiration offset in ms (default: +1h, negative for expired) */
  expiresInMs?: number;
  /** Whether token should be marked as used (default: false) */
  used?: boolean;
}

export interface CreatePasswordResetTokenResult {
  /** Raw token to use in API requests */
  token: string;
  /** Hashed token stored in DB */
  tokenHash: string;
  /** Token record ID */
  tokenId: string;
  /** Token expiration date */
  expiresAt: Date;
}

/**
 * Create a password reset token directly in DB.
 * Returns both raw token (for API) and hash (for verification).
 */
export const createPasswordResetToken = async (
  options: CreatePasswordResetTokenOptions
): Promise<CreatePasswordResetTokenResult> => {
  const db = getTestDb();
  const { token, tokenHash } = generateTestToken();
  // Default to 1 hour (PASSWORD_RESET_TOKEN_EXPIRY_HOURS)
  const expiresAt = new Date(Date.now() + (options.expiresInMs ?? 60 * 60 * 1000));

  const [record] = await db
    .insert(passwordResetTokens)
    .values({
      id: uuidv7(),
      userId: options.userId,
      tokenHash,
      expiresAt,
      usedAt: options.used ? new Date() : null,
    })
    .returning();

  if (!record) throw new Error('Failed to create password reset token');

  return {
    token,
    tokenHash,
    tokenId: record.id,
    expiresAt,
  };
};

// =============================================================================
// Password Reset Token Queries
// =============================================================================

/**
 * Get password reset token by user ID.
 */
export const getPasswordResetTokenByUserId = async (userId: string) => {
  const db = getTestDb();
  const result = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId))
    .limit(1);
  return result[0] ?? null;
};

/**
 * Get password reset token by token hash.
 */
export const getPasswordResetTokenByHash = async (tokenHash: string) => {
  const db = getTestDb();
  const result = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  return result[0] ?? null;
};

/**
 * Get all password reset tokens for a user.
 */
export const getAllPasswordResetTokensForUser = async (userId: string) => {
  const db = getTestDb();
  return db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
};
