/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-non-null-assertion */
import { eq, and, isNull } from 'drizzle-orm';
import crypto from 'node:crypto';
import supertest from 'supertest';
import { uuidv7 } from 'uuidv7';
import { app } from '../../app.js';
import { getTestDb } from '../setup.js';
import { sessions } from '../../db/schema/index.js';

// =============================================================================
// Session Creation via Login
// =============================================================================

/**
 * Login a user and return the session cookie.
 * Useful for testing authenticated endpoints.
 */
export const loginAndGetCookie = async (email: string, password: string): Promise<string> => {
  const response = await supertest(app).post('/auth/login').send({ email, password }).expect(200);

  const setCookie = response.headers['set-cookie'];
  if (!setCookie) throw new Error('No session cookie returned from login');

  // Extract the cookie string (first one if array)
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sidCookie = cookies.find((c) => c.startsWith('sid='));
  if (!sidCookie) throw new Error('No sid cookie found');

  return sidCookie.split(';')[0]!; // Return just "sid=value"
};

/**
 * Login a user and return both the cookie and parsed session details.
 */
export const loginAndGetSession = async (
  email: string,
  password: string
): Promise<{ cookie: string; userId: string }> => {
  const response = await supertest(app).post('/auth/login').send({ email, password }).expect(200);

  const setCookie = response.headers['set-cookie'];
  if (!setCookie) throw new Error('No session cookie returned from login');

  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sidCookie = cookies.find((c) => c.startsWith('sid='));
  if (!sidCookie) throw new Error('No sid cookie found');

  return {
    cookie: sidCookie.split(';')[0]!,
    userId: response.body.user.id as string,
  };
};

// =============================================================================
// Direct Session Creation (for testing multiple sessions)
// =============================================================================

/**
 * Create a session directly in the database.
 * Returns the raw session ID (for cookie) and the session record ID.
 * Note: This creates a session without going through the full auth flow.
 */
export const createDirectSession = async (options: {
  userId: string;
  organizationId: string;
  expiresInMs?: number;
  revoked?: boolean;
}): Promise<{ sessionId: string; sidHash: string; recordId: string; cookie: string }> => {
  const db = getTestDb();

  // Generate session ID (raw value that goes in cookie)
  const sessionId = crypto.randomBytes(32).toString('hex');
  const sidHash = crypto.createHash('sha256').update(sessionId).digest('hex');
  const expiresAt = new Date(Date.now() + (options.expiresInMs ?? 24 * 60 * 60 * 1000));

  const [record] = await db
    .insert(sessions)
    .values({
      id: uuidv7(),
      sidHash,
      userId: options.userId,
      organizationId: options.organizationId,
      data: {},
      expiresAt,
      revokedAt: options.revoked ? new Date() : null,
    })
    .returning();

  if (!record) throw new Error('Failed to create session');

  return {
    sessionId,
    sidHash,
    recordId: record.id,
    cookie: `sid=${sessionId}`,
  };
};

// =============================================================================
// Session Queries
// =============================================================================

/**
 * Get all sessions for a user.
 */
export const getSessionsByUserId = async (userId: string) => {
  const db = getTestDb();
  return db.select().from(sessions).where(eq(sessions.userId, userId));
};

/**
 * Get all active (non-revoked) sessions for a user.
 */
export const getActiveSessionsByUserId = async (userId: string) => {
  const db = getTestDb();
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
};

/**
 * Get session by record ID.
 */
export const getSessionById = async (sessionId: string) => {
  const db = getTestDb();
  const result = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  return result[0] ?? null;
};

/**
 * Get session by sidHash (the hashed session ID).
 */
export const getSessionBySidHash = async (sidHash: string) => {
  const db = getTestDb();
  const result = await db.select().from(sessions).where(eq(sessions.sidHash, sidHash)).limit(1);
  return result[0] ?? null;
};

/**
 * Count total sessions for a user.
 */
export const countSessionsByUserId = async (userId: string): Promise<number> => {
  const sessions = await getSessionsByUserId(userId);
  return sessions.length;
};

/**
 * Count active sessions for a user.
 */
export const countActiveSessionsByUserId = async (userId: string): Promise<number> => {
  const sessions = await getActiveSessionsByUserId(userId);
  return sessions.length;
};
