import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { getTestDb } from '../setup.js';
import { invitations, type Invitation } from '../../db/schema.js';
import { INVITATION_EXPIRY_HOURS } from '../../modules/auth/constants.js';

// =============================================================================
// Invitation Creation
// =============================================================================

export interface CreateTestInvitationOptions {
  organizationId: string;
  roleId: string;
  invitedById: string;
  email?: string;
  /** Token expiration offset in ms from now (default: 48h, negative for expired) */
  expiresInMs?: number;
  /** Whether invitation is revoked (default: false) */
  revoked?: boolean;
  /** Whether invitation is accepted (default: false) */
  accepted?: boolean;
}

export interface CreateTestInvitationResult {
  invitation: Invitation;
  /** The raw token (not hashed) - use this in API requests */
  token: string;
  /** The token hash stored in DB */
  tokenHash: string;
}

/**
 * Create a test invitation directly in the database.
 * Useful for testing accept-invitation, list-invitations, and revoke-invitation flows.
 */
export const createTestInvitation = async (
  options: CreateTestInvitationOptions
): Promise<CreateTestInvitationResult> => {
  const db = getTestDb();
  const uniqueId = `${String(Date.now())}${Math.random().toString(36).slice(2)}`;

  // Generate token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Default to 48 hours (INVITATION_EXPIRY_HOURS)
  const defaultExpiresInMs = INVITATION_EXPIRY_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + (options.expiresInMs ?? defaultExpiresInMs));

  const now = new Date();

  const [invitation] = await db
    .insert(invitations)
    .values({
      id: uuidv7(),
      organizationId: options.organizationId,
      email: options.email ?? `invite-${uniqueId}@example.com`,
      roleId: options.roleId,
      invitedById: options.invitedById,
      tokenHash,
      expiresAt,
      acceptedAt: options.accepted ? now : null,
      revokedAt: options.revoked ? now : null,
    })
    .returning();

  if (!invitation) throw new Error('Failed to create test invitation');

  return {
    invitation,
    token,
    tokenHash,
  };
};

// =============================================================================
// Invitation Queries
// =============================================================================

/**
 * Get invitation by ID.
 */
export const getInvitationById = async (id: string): Promise<Invitation | null> => {
  const db = getTestDb();
  const result = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1);
  return result[0] ?? null;
};

/**
 * Get all invitations for an organization.
 */
export const getInvitationsForOrg = async (organizationId: string): Promise<Invitation[]> => {
  const db = getTestDb();
  return db.select().from(invitations).where(eq(invitations.organizationId, organizationId));
};

/**
 * Get all invitations by email.
 */
export const getInvitationsByEmail = async (email: string): Promise<Invitation[]> => {
  const db = getTestDb();
  return db.select().from(invitations).where(eq(invitations.email, email.toLowerCase()));
};
