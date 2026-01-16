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
  accounts,
  agents,
  idCounters,
  roles,
  organizations,
} from '../../db/schema/index.js';

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
  accounts,
  agents,
  idCounters,
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

/**
 * Polls until a condition is met or max attempts reached.
 * Useful for testing fire-and-forget async operations like audit logs.
 */
export const pollUntil = async <T>(
  fn: () => Promise<T | undefined>,
  options: { maxAttempts?: number; delayMs?: number } = {}
): Promise<T> => {
  const { maxAttempts = 10, delayMs = 50 } = options;
  for (let i = 0; i < maxAttempts; i++) {
    const result = await fn();
    if (result !== undefined) return result;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`pollUntil: condition not met after ${String(maxAttempts)} attempts`);
};
