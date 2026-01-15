import { getTestDb } from '../setup.js';
import {
  auditLogs,
  sessions,
  rolePermissions,
  invitations,
  emailVerificationTokens,
  passwordResetTokens,
  profiles,
  users,
  roles,
  organizations,
} from '../../db/schema.js';

/**
 * Tables in dependency order for cleanup (children first).
 * Note: `permissions` is excluded because it contains seed data
 * that should persist across tests.
 */
const TABLES = [
  auditLogs,
  sessions,
  rolePermissions,
  invitations,
  emailVerificationTokens,
  passwordResetTokens,
  profiles,
  users,
  roles,
  organizations,
] as const;

/**
 * Truncate all tables in correct dependency order.
 * Call in beforeEach/afterEach for test isolation.
 */
export const cleanupDatabase = async (): Promise<void> => {
  const db = getTestDb();
  for (const table of TABLES) {
    await db.delete(table);
  }
};
