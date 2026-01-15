import { uuidv7 } from 'uuidv7';
import { getTestDb } from '../setup.js';
import { organizations } from '../../db/schema.js';

// =============================================================================
// Types
// =============================================================================

export interface CreateOrganizationOptions {
  /** Custom organization name (default: 'Test Org') */
  name?: string;
  /** Custom slug (default: generated unique slug) */
  slug?: string;
  /** Whether organization is soft-deleted (default: false) */
  deleted?: boolean;
}

export interface CreateOrganizationResult {
  organization: typeof organizations.$inferSelect;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a standalone test organization (without user).
 * Useful for testing slug conflict scenarios.
 */
export const createTestOrganization = async (
  options: CreateOrganizationOptions = {}
): Promise<CreateOrganizationResult> => {
  const db = getTestDb();
  const now = new Date();
  const uniqueId = `${String(Date.now())}${Math.random().toString(36).slice(2)}`;

  const [org] = await db
    .insert(organizations)
    .values({
      id: uuidv7(),
      name: options.name ?? 'Test Org',
      slug: options.slug ?? `test-org-${uniqueId}`,
      deletedAt: options.deleted ? now : null,
    })
    .returning();

  if (!org) throw new Error('Failed to create test organization');

  return { organization: org };
};
