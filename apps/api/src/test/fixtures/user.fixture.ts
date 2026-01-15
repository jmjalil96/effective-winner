import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import crypto from 'node:crypto';
import { getTestDb } from '../setup.js';
import {
  users,
  profiles,
  organizations,
  roles,
  permissions,
  rolePermissions,
  emailVerificationTokens,
  passwordResetTokens,
} from '../../db/schema/index.js';
import { getTestPasswordHash } from '../helpers/crypto.js';

// =============================================================================
// Types
// =============================================================================

export interface CreateUserOptions {
  /** Custom email (default: generated unique email) */
  email?: string;
  /** Set to null for OAuth-only user with no password */
  password?: string | null;
  /** Whether email is verified (default: true) */
  emailVerified?: boolean;
  /** Whether account is active (default: true) */
  isActive?: boolean;
  /** Number of failed login attempts (default: 0) */
  failedAttempts?: number;
  /** Account locked until this date (default: null) */
  lockedUntil?: Date | null;
  /** Whether user is soft-deleted (default: false) */
  deleted?: boolean;
  /** Whether organization is soft-deleted (default: false) */
  organizationDeleted?: boolean;
  /** Whether to create profile (default: true) */
  withProfile?: boolean;
  /** Permission names to assign to user's role */
  permissionNames?: string[];
  /** Custom organization name */
  organizationName?: string;
  /** Custom role name */
  roleName?: string;
  /** First name for profile */
  firstName?: string;
  /** Last name for profile */
  lastName?: string;
}

export interface CreateUserResult {
  user: typeof users.$inferSelect;
  organization: typeof organizations.$inferSelect;
  role: typeof roles.$inferSelect;
  profile: typeof profiles.$inferSelect | null;
  /** The password that can be used to login (VALID_PASSWORD unless password: null) */
  password: string | null;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a test user with organization, role, and optional profile.
 * Supports all login test scenarios via options.
 */
export const createTestUser = async (
  options: CreateUserOptions = {}
): Promise<CreateUserResult> => {
  const db = getTestDb();
  const now = new Date();
  const uniqueId = `${String(Date.now())}${Math.random().toString(36).slice(2)}`;

  // Create organization
  const [org] = await db
    .insert(organizations)
    .values({
      id: uuidv7(),
      name: options.organizationName ?? 'Test Org',
      slug: `test-org-${uniqueId}`,
      deletedAt: options.organizationDeleted ? now : null,
    })
    .returning();

  if (!org) throw new Error('Failed to create test organization');

  // Create role
  const [role] = await db
    .insert(roles)
    .values({
      id: uuidv7(),
      organizationId: org.id,
      name: options.roleName ?? 'Member',
      description: 'Test role',
      isDefault: true,
    })
    .returning();

  if (!role) throw new Error('Failed to create test role');

  // Create and assign permissions
  if (options.permissionNames?.length) {
    for (const name of options.permissionNames) {
      // Check if permission exists
      const existing = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.name, name))
        .limit(1);

      let permissionId: string;
      if (existing[0]) {
        permissionId = existing[0].id;
      } else {
        const [perm] = await db
          .insert(permissions)
          .values({ id: uuidv7(), name, description: `Test permission: ${name}` })
          .returning();
        if (!perm) throw new Error(`Failed to create permission: ${name}`);
        permissionId = perm.id;
      }

      await db.insert(rolePermissions).values({
        roleId: role.id,
        permissionId,
      });
    }
  }

  // Determine password hash
  let passwordHash: string | null = null;
  let returnedPassword: string | null = null;

  if (options.password !== null) {
    const { VALID_PASSWORD } = await import('../helpers/crypto.js');
    passwordHash = await getTestPasswordHash();
    returnedPassword = VALID_PASSWORD;
  }

  // Create user
  const [user] = await db
    .insert(users)
    .values({
      id: uuidv7(),
      organizationId: org.id,
      roleId: role.id,
      email: options.email ?? `test-${uniqueId}@example.com`,
      passwordHash,
      emailVerifiedAt: options.emailVerified !== false ? now : null,
      isActive: options.isActive !== false,
      failedLoginAttempts: options.failedAttempts ?? 0,
      lockedUntil: options.lockedUntil ?? null,
      deletedAt: options.deleted ? now : null,
    })
    .returning();

  if (!user) throw new Error('Failed to create test user');

  // Create profile
  let profile: typeof profiles.$inferSelect | null = null;
  if (options.withProfile !== false) {
    const [p] = await db
      .insert(profiles)
      .values({
        userId: user.id,
        firstName: options.firstName ?? 'Test',
        lastName: options.lastName ?? 'User',
      })
      .returning();
    profile = p ?? null;
  }

  return {
    user,
    organization: org,
    role,
    profile,
    password: returnedPassword,
  };
};

// =============================================================================
// Permission Seeding
// =============================================================================

/**
 * Seed standard permissions used across tests.
 * Call once per test file if needed.
 */
export const seedPermissions = async (names: string[]): Promise<void> => {
  const db = getTestDb();
  for (const name of names) {
    await db
      .insert(permissions)
      .values({ id: uuidv7(), name, description: `Permission: ${name}` })
      .onConflictDoNothing();
  }
};

// =============================================================================
// Unverified User with Verification Token
// =============================================================================

export interface CreateUnverifiedUserOptions extends CreateUserOptions {
  /** Token expiration offset in ms from now (default: +24h, negative for expired) */
  tokenExpiresInMs?: number;
  /** Whether token is already used (default: false) */
  tokenUsed?: boolean;
}

export interface CreateUnverifiedUserResult extends CreateUserResult {
  /** The raw token (not hashed) - use this in API requests */
  token: string;
  /** The token hash stored in DB */
  tokenHash: string;
  /** Token expiration date */
  tokenExpiresAt: Date;
}

/**
 * Create an unverified test user with email verification token.
 * Useful for testing verify-email and resend-verification flows.
 */
export const createUnverifiedUser = async (
  options: CreateUnverifiedUserOptions = {}
): Promise<CreateUnverifiedUserResult> => {
  const db = getTestDb();

  // Create user with emailVerified: false by default
  const result = await createTestUser({
    ...options,
    emailVerified: false,
  });

  // Generate verification token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenExpiresAt = new Date(Date.now() + (options.tokenExpiresInMs ?? 24 * 60 * 60 * 1000));

  // Store token
  await db.insert(emailVerificationTokens).values({
    id: uuidv7(),
    userId: result.user.id,
    tokenHash,
    expiresAt: tokenExpiresAt,
    usedAt: options.tokenUsed ? new Date() : null,
  });

  return {
    ...result,
    token,
    tokenHash,
    tokenExpiresAt,
  };
};

// =============================================================================
// User with Password Reset Token
// =============================================================================

export interface CreateUserWithResetTokenOptions extends CreateUserOptions {
  /** Token expiration offset in ms from now (default: +1h, negative for expired) */
  tokenExpiresInMs?: number;
  /** Whether token is already used (default: false) */
  tokenUsed?: boolean;
}

export interface CreateUserWithResetTokenResult extends CreateUserResult {
  /** The raw token (not hashed) - use this in API requests */
  token: string;
  /** The token hash stored in DB */
  tokenHash: string;
  /** Token expiration date */
  tokenExpiresAt: Date;
}

/**
 * Create a test user with password reset token.
 * Useful for testing reset-password flow.
 */
export const createUserWithResetToken = async (
  options: CreateUserWithResetTokenOptions = {}
): Promise<CreateUserWithResetTokenResult> => {
  const db = getTestDb();

  // Create verified user (must be verified to be able to login)
  const result = await createTestUser({
    ...options,
    emailVerified: true,
  });

  // Generate reset token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  // Default to 1 hour (PASSWORD_RESET_TOKEN_EXPIRY_HOURS)
  const tokenExpiresAt = new Date(Date.now() + (options.tokenExpiresInMs ?? 60 * 60 * 1000));

  // Store token
  await db.insert(passwordResetTokens).values({
    id: uuidv7(),
    userId: result.user.id,
    tokenHash,
    expiresAt: tokenExpiresAt,
    usedAt: options.tokenUsed ? new Date() : null,
  });

  return {
    ...result,
    token,
    tokenHash,
    tokenExpiresAt,
  };
};
