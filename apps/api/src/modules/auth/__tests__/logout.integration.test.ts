/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { app } from '../../../app.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import {
  loginAndGetCookie,
  loginAndGetSession,
  createDirectSession,
  getSessionsByUserId,
  getActiveSessionsByUserId,
} from '../../../test/helpers/session.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('POST /auth/logout', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).post('/auth/logout').expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .post('/auth/logout')
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser();

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000, // Expired 1 hour ago
      });

      const response = await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });

    it('returns 401 with revoked session', async () => {
      const { user, organization } = await createTestUser();

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        revoked: true,
      });

      const response = await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Session revoked');
    });
  });

  // ===========================================================================
  // Success (204)
  // ===========================================================================

  describe('success (204)', () => {
    it('returns 204 No Content', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(204);

      expect(response.text).toBe('');
    });

    it('clears sid cookie', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(204);

      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();

      // Cookie should be cleared (empty value or expired)
      const sidCookie = Array.isArray(setCookie)
        ? setCookie.find((c: string) => c.startsWith('sid='))
        : setCookie;
      expect(sidCookie).toBeDefined();
      // Cookie should either be empty or have an expiration in the past
      expect(sidCookie).toMatch(/sid=/);
    });

    it('hard-deletes session from database', async () => {
      const { user } = await createTestUser();
      const { cookie } = await loginAndGetSession(user.email, VALID_PASSWORD);

      // Verify session exists before logout
      const beforeSessions = await getSessionsByUserId(user.id);
      expect(beforeSessions.length).toBe(1);

      await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(204);

      // Session should be revoked (soft-deleted for audit trail)
      // Total sessions still exists (for audit), but no active sessions
      const afterSessions = await getSessionsByUserId(user.id);
      expect(afterSessions).toHaveLength(1);
      expect(afterSessions[0]?.revokedAt).not.toBeNull();

      const activeSessions = await getActiveSessionsByUserId(user.id);
      expect(activeSessions).toHaveLength(0);
    });

    it('session cookie invalid after logout', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(204);

      // Using the same cookie should fail (session revoked)
      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Session revoked');
    });

    it('does not affect other user sessions', async () => {
      const { user: user1 } = await createTestUser({ email: 'user1@example.com' });
      const { user: user2 } = await createTestUser({ email: 'user2@example.com' });

      const cookie1 = await loginAndGetCookie(user1.email, VALID_PASSWORD);
      const cookie2 = await loginAndGetCookie(user2.email, VALID_PASSWORD);

      // User1 logs out
      await supertest(app).post('/auth/logout').set('Cookie', cookie1).expect(204);

      // User2's session should still work
      const response = await supertest(app).get('/auth/me').set('Cookie', cookie2).expect(200);

      expect(response.body.user.id).toBe(user2.id);
    });

    it('does not affect other sessions of same user', async () => {
      const { user, organization } = await createTestUser();

      // Create two sessions for the same user
      const cookie1 = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const { cookie: cookie2 } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
      });

      // Logout session 1
      await supertest(app).post('/auth/logout').set('Cookie', cookie1).expect(204);

      // Session 2 should still work
      const response = await supertest(app).get('/auth/me').set('Cookie', cookie2).expect(200);

      expect(response.body.user.id).toBe(user.id);
    });
  });

  // ===========================================================================
  // Cookie Behavior
  // ===========================================================================

  describe('cookie behavior', () => {
    it('Set-Cookie has httpOnly flag', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(204);

      const setCookie = response.headers['set-cookie'];
      const sidCookie = Array.isArray(setCookie)
        ? setCookie.find((c: string) => c.startsWith('sid='))
        : setCookie;

      expect(sidCookie?.toLowerCase()).toContain('httponly');
    });

    it('Set-Cookie has correct path', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(204);

      const setCookie = response.headers['set-cookie'];
      const sidCookie = Array.isArray(setCookie)
        ? setCookie.find((c: string) => c.startsWith('sid='))
        : setCookie;

      expect(sidCookie?.toLowerCase()).toContain('path=/');
    });

    it('Set-Cookie has sameSite attribute', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(204);

      const setCookie = response.headers['set-cookie'];
      const sidCookie = Array.isArray(setCookie)
        ? setCookie.find((c: string) => c.startsWith('sid='))
        : setCookie;

      expect(sidCookie?.toLowerCase()).toContain('samesite');
    });
  });

  // ===========================================================================
  // Post-Logout Behavior
  // ===========================================================================

  describe('post-logout behavior', () => {
    it('user can login again after logout', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Logout
      await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(204);

      // Login again
      const newCookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // New session should work
      const response = await supertest(app).get('/auth/me').set('Cookie', newCookie).expect(200);

      expect(response.body.user.id).toBe(user.id);
    });

    it('old session ID does not work after logout', async () => {
      const { user } = await createTestUser();
      const oldCookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Logout
      await supertest(app).post('/auth/logout').set('Cookie', oldCookie).expect(204);

      // Old cookie should fail (session revoked)
      const response = await supertest(app).get('/auth/me').set('Cookie', oldCookie).expect(401);

      expect(response.body.error.message).toBe('Session revoked');
    });

    it('multiple consecutive logouts fail after first', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // First logout succeeds
      await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(204);

      // Second logout fails (session already revoked)
      const response = await supertest(app).post('/auth/logout').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Session revoked');
    });
  });
});
