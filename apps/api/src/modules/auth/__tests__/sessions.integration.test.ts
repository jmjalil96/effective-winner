/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-template-expressions */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { app } from '../../../app.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import {
  loginAndGetCookie,
  loginAndGetSession,
  createDirectSession,
  getSessionById,
  getActiveSessionsByUserId,
} from '../../../test/helpers/session.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('Session Management Endpoints', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // GET /auth/sessions (List Sessions)
  // ===========================================================================

  describe('GET /auth/sessions', () => {
    // -------------------------------------------------------------------------
    // Unauthorized (401)
    // -------------------------------------------------------------------------

    describe('unauthorized errors (401)', () => {
      it('returns 401 without session cookie', async () => {
        const response = await supertest(app).get('/auth/sessions').expect(401);

        expect(response.body.error.message).toBe('Authentication required');
      });

      it('returns 401 with invalid session cookie', async () => {
        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', 'sid=invalidsessionid123')
          .expect(401);

        expect(response.body.error.message).toBe('Authentication required');
      });

      it('returns 401 with expired session', async () => {
        const { user, organization } = await createTestUser();

        const { cookie } = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
          expiresInMs: -60 * 60 * 1000,
        });

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(401);

        expect(response.body.error.message).toBe('Session expired');
      });

      it('returns 401 with revoked session', async () => {
        const { user, organization } = await createTestUser();

        const { cookie } = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
          revoked: true,
        });

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(401);

        expect(response.body.error.message).toBe('Session revoked');
      });
    });

    // -------------------------------------------------------------------------
    // Success (200) - Single Session
    // -------------------------------------------------------------------------

    describe('success (200) - single session', () => {
      it('returns 200 with sessions array', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        expect(response.body).toHaveProperty('sessions');
        expect(Array.isArray(response.body.sessions)).toBe(true);
      });

      it('returns current session with current=true', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        expect(response.body.sessions.length).toBe(1);
        expect(response.body.sessions[0].current).toBe(true);
      });

      it('session has correct id (UUID format)', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        const session = response.body.sessions[0];
        expect(session.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });

      it('session has ISO timestamp strings', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        const session = response.body.sessions[0];
        expect(session.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(session.lastAccessedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(session.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });

      it('session includes ipAddress and userAgent fields', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        const session = response.body.sessions[0];
        expect(session).toHaveProperty('ipAddress');
        expect(session).toHaveProperty('userAgent');
      });
    });

    // -------------------------------------------------------------------------
    // Success (200) - Multiple Sessions
    // -------------------------------------------------------------------------

    describe('success (200) - multiple sessions', () => {
      it('returns all active sessions', async () => {
        const { user, organization } = await createTestUser();

        // Create multiple sessions
        await createDirectSession({ userId: user.id, organizationId: organization.id });
        await createDirectSession({ userId: user.id, organizationId: organization.id });
        const { cookie } = await loginAndGetSession(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        expect(response.body.sessions.length).toBe(3);
      });

      it('marks correct session as current=true', async () => {
        const { user, organization } = await createTestUser();

        // Create other sessions
        await createDirectSession({ userId: user.id, organizationId: organization.id });
        await createDirectSession({ userId: user.id, organizationId: organization.id });

        // Login to get current session
        const { cookie } = await loginAndGetSession(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        const currentSessions = response.body.sessions.filter(
          (s: { current: boolean }) => s.current
        );
        expect(currentSessions.length).toBe(1);
      });

      it('excludes revoked sessions', async () => {
        const { user, organization } = await createTestUser();

        // Create active sessions
        await createDirectSession({ userId: user.id, organizationId: organization.id });
        // Create revoked session
        await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
          revoked: true,
        });

        const { cookie } = await loginAndGetSession(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        // Should only see 2 active sessions (1 direct + 1 login), not the revoked one
        expect(response.body.sessions.length).toBe(2);
      });

      it('excludes expired sessions', async () => {
        const { user, organization } = await createTestUser();

        // Create active session
        await createDirectSession({ userId: user.id, organizationId: organization.id });
        // Create expired session
        await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
          expiresInMs: -1000,
        });

        const { cookie } = await loginAndGetSession(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        // Should only see 2 active sessions
        expect(response.body.sessions.length).toBe(2);
      });

      it('sessions belong only to current user', async () => {
        const { user: user1, organization: org1 } = await createTestUser({
          email: 'user1@example.com',
        });
        const { user: user2 } = await createTestUser({ email: 'user2@example.com' });

        // Create sessions for user1
        await createDirectSession({ userId: user1.id, organizationId: org1.id });
        const cookie1 = await loginAndGetCookie(user1.email, VALID_PASSWORD);

        // Create session for user2
        await loginAndGetCookie(user2.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie1)
          .expect(200);

        // User1 should only see their 2 sessions
        expect(response.body.sessions.length).toBe(2);
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('handles session with null ipAddress', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        // ipAddress may be null (depends on test environment)
        const session = response.body.sessions[0];
        expect(session).toHaveProperty('ipAddress');
      });

      it('handles session with null userAgent', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        const session = response.body.sessions[0];
        expect(session).toHaveProperty('userAgent');
      });
    });
  });

  // ===========================================================================
  // DELETE /auth/sessions/:id (Revoke Single Session)
  // ===========================================================================

  describe('DELETE /auth/sessions/:id', () => {
    // -------------------------------------------------------------------------
    // Unauthorized (401)
    // -------------------------------------------------------------------------

    describe('unauthorized errors (401)', () => {
      it('returns 401 without session cookie', async () => {
        const response = await supertest(app).delete(`/auth/sessions/${uuidv7()}`).expect(401);

        expect(response.body.error.message).toBe('Authentication required');
      });

      it('returns 401 with invalid session cookie', async () => {
        const response = await supertest(app)
          .delete(`/auth/sessions/${uuidv7()}`)
          .set('Cookie', 'sid=invalidsessionid123')
          .expect(401);

        expect(response.body.error.message).toBe('Authentication required');
      });
    });

    // -------------------------------------------------------------------------
    // Validation (400)
    // -------------------------------------------------------------------------

    describe('validation errors (400)', () => {
      it('returns 400 for non-UUID session id', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .delete('/auth/sessions/not-a-uuid')
          .set('Cookie', cookie)
          .expect(400);

        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('returns 400 for malformed UUID', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .delete('/auth/sessions/123-456-789')
          .set('Cookie', cookie)
          .expect(400);

        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    // -------------------------------------------------------------------------
    // Not Found (404)
    // -------------------------------------------------------------------------

    describe('not found errors (404)', () => {
      it('returns 404 for non-existent session id', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .delete(`/auth/sessions/${uuidv7()}`)
          .set('Cookie', cookie)
          .expect(404);

        expect(response.body.error.message).toBe('Session not found');
      });

      it('returns 404 when revoking current session', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        // Get current session ID
        const sessionsResponse = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        const currentSession = sessionsResponse.body.sessions.find(
          (s: { current: boolean }) => s.current
        );

        // Try to revoke current session
        const response = await supertest(app)
          .delete(`/auth/sessions/${currentSession.id}`)
          .set('Cookie', cookie)
          .expect(404);

        expect(response.body.error.message).toBe('Session not found');
      });

      it('returns 404 for already revoked session', async () => {
        const { user, organization } = await createTestUser();

        // Create a session and revoke it
        const { recordId } = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
          revoked: true,
        });

        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .delete(`/auth/sessions/${recordId}`)
          .set('Cookie', cookie)
          .expect(404);

        expect(response.body.error.message).toBe('Session not found');
      });

      it('returns 404 for another user session', async () => {
        const { user: user1 } = await createTestUser({ email: 'user1@example.com' });
        const { user: user2, organization: org2 } = await createTestUser({
          email: 'user2@example.com',
        });

        // Create session for user2
        const { recordId: user2SessionId } = await createDirectSession({
          userId: user2.id,
          organizationId: org2.id,
        });

        // Login as user1
        const cookie1 = await loginAndGetCookie(user1.email, VALID_PASSWORD);

        // Try to revoke user2's session
        const response = await supertest(app)
          .delete(`/auth/sessions/${user2SessionId}`)
          .set('Cookie', cookie1)
          .expect(404);

        expect(response.body.error.message).toBe('Session not found');
      });

      it('allows revoking expired session (harmless operation)', async () => {
        const { user, organization } = await createTestUser();

        // Create expired session
        const { recordId } = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
          expiresInMs: -1000,
        });

        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        // Revoking an expired session is allowed (no harm done)
        await supertest(app).delete(`/auth/sessions/${recordId}`).set('Cookie', cookie).expect(204);
      });
    });

    // -------------------------------------------------------------------------
    // Success (204)
    // -------------------------------------------------------------------------

    describe('success (204)', () => {
      it('returns 204 No Content', async () => {
        const { user, organization } = await createTestUser();

        // Create another session to revoke
        const { recordId: otherSessionId } = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
        });

        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .delete(`/auth/sessions/${otherSessionId}`)
          .set('Cookie', cookie)
          .expect(204);

        expect(response.text).toBe('');
      });

      it('soft-revokes session (sets revokedAt)', async () => {
        const { user, organization } = await createTestUser();

        const { recordId: otherSessionId } = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
        });

        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        await supertest(app)
          .delete(`/auth/sessions/${otherSessionId}`)
          .set('Cookie', cookie)
          .expect(204);

        // Check that session has revokedAt set
        const session = await getSessionById(otherSessionId);
        expect(session).not.toBeNull();
        expect(session!.revokedAt).not.toBeNull();
      });

      it('session no longer appears in GET /sessions', async () => {
        const { user, organization } = await createTestUser();

        const { recordId: otherSessionId } = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
        });

        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        // Verify session is visible before revoke
        const beforeResponse = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        expect(beforeResponse.body.sessions.length).toBe(2);

        // Revoke session
        await supertest(app)
          .delete(`/auth/sessions/${otherSessionId}`)
          .set('Cookie', cookie)
          .expect(204);

        // Session should no longer appear
        const afterResponse = await supertest(app)
          .get('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        expect(afterResponse.body.sessions.length).toBe(1);
      });

      it('revoked session returns 401 on use', async () => {
        const { user, organization } = await createTestUser();

        const { recordId: otherSessionId, cookie: otherCookie } = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
        });

        const currentCookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        // Verify other session works before revoke
        await supertest(app).get('/auth/me').set('Cookie', otherCookie).expect(200);

        // Revoke the other session
        await supertest(app)
          .delete(`/auth/sessions/${otherSessionId}`)
          .set('Cookie', currentCookie)
          .expect(204);

        // Other session should now fail
        const response = await supertest(app)
          .get('/auth/me')
          .set('Cookie', otherCookie)
          .expect(401);

        expect(response.body.error.message).toBe('Session revoked');
      });

      it('current session still works after revoking other', async () => {
        const { user, organization } = await createTestUser();

        const { recordId: otherSessionId } = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
        });

        const currentCookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        // Revoke the other session
        await supertest(app)
          .delete(`/auth/sessions/${otherSessionId}`)
          .set('Cookie', currentCookie)
          .expect(204);

        // Current session should still work
        const response = await supertest(app)
          .get('/auth/me')
          .set('Cookie', currentCookie)
          .expect(200);

        expect(response.body.user.id).toBe(user.id);
      });
    });
  });

  // ===========================================================================
  // DELETE /auth/sessions (Revoke All Other Sessions)
  // ===========================================================================

  describe('DELETE /auth/sessions', () => {
    // -------------------------------------------------------------------------
    // Unauthorized (401)
    // -------------------------------------------------------------------------

    describe('unauthorized errors (401)', () => {
      it('returns 401 without session cookie', async () => {
        const response = await supertest(app).delete('/auth/sessions').expect(401);

        expect(response.body.error.message).toBe('Authentication required');
      });

      it('returns 401 with invalid session cookie', async () => {
        const response = await supertest(app)
          .delete('/auth/sessions')
          .set('Cookie', 'sid=invalidsessionid123')
          .expect(401);

        expect(response.body.error.message).toBe('Authentication required');
      });
    });

    // -------------------------------------------------------------------------
    // Success (200)
    // -------------------------------------------------------------------------

    describe('success (200)', () => {
      it('returns 200 with revokedCount', async () => {
        const { user, organization } = await createTestUser();

        // Create other sessions
        await createDirectSession({ userId: user.id, organizationId: organization.id });
        await createDirectSession({ userId: user.id, organizationId: organization.id });
        await createDirectSession({ userId: user.id, organizationId: organization.id });

        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .delete('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        expect(response.body.revokedCount).toBe(3);
      });

      it('returns revokedCount: 0 when no other sessions', async () => {
        const { user } = await createTestUser();
        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .delete('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        expect(response.body.revokedCount).toBe(0);
      });

      it('soft-revokes all other sessions', async () => {
        const { user, organization } = await createTestUser();

        const session1 = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
        });
        const session2 = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
        });

        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        await supertest(app).delete('/auth/sessions').set('Cookie', cookie).expect(200);

        // Check both sessions are revoked
        const s1 = await getSessionById(session1.recordId);
        const s2 = await getSessionById(session2.recordId);
        expect(s1!.revokedAt).not.toBeNull();
        expect(s2!.revokedAt).not.toBeNull();
      });

      it('does not revoke current session', async () => {
        const { user, organization } = await createTestUser();

        await createDirectSession({ userId: user.id, organizationId: organization.id });

        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        await supertest(app).delete('/auth/sessions').set('Cookie', cookie).expect(200);

        // Current session should still be active
        const activeSessions = await getActiveSessionsByUserId(user.id);
        expect(activeSessions.length).toBe(1);
      });

      it('revoked sessions return 401 on use', async () => {
        const { user, organization } = await createTestUser();

        const { cookie: otherCookie } = await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
        });

        const currentCookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        // Verify other session works
        await supertest(app).get('/auth/me').set('Cookie', otherCookie).expect(200);

        // Revoke all other sessions
        await supertest(app).delete('/auth/sessions').set('Cookie', currentCookie).expect(200);

        // Other session should fail
        const response = await supertest(app)
          .get('/auth/me')
          .set('Cookie', otherCookie)
          .expect(401);

        expect(response.body.error.message).toBe('Session revoked');
      });

      it('current session still works after revoke all', async () => {
        const { user, organization } = await createTestUser();

        await createDirectSession({ userId: user.id, organizationId: organization.id });

        const currentCookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        await supertest(app).delete('/auth/sessions').set('Cookie', currentCookie).expect(200);

        // Current session should still work
        const response = await supertest(app)
          .get('/auth/me')
          .set('Cookie', currentCookie)
          .expect(200);

        expect(response.body.user.id).toBe(user.id);
      });
    });

    // -------------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------------

    describe('edge cases', () => {
      it('idempotent - second call returns 0', async () => {
        const { user, organization } = await createTestUser();

        await createDirectSession({ userId: user.id, organizationId: organization.id });
        await createDirectSession({ userId: user.id, organizationId: organization.id });

        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        // First revoke
        const response1 = await supertest(app)
          .delete('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        expect(response1.body.revokedCount).toBe(2);

        // Second revoke - should return 0
        const response2 = await supertest(app)
          .delete('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        expect(response2.body.revokedCount).toBe(0);
      });

      it('does not affect other users sessions', async () => {
        const { user: user1, organization: org1 } = await createTestUser({
          email: 'user1@example.com',
        });
        const { user: user2, organization: org2 } = await createTestUser({
          email: 'user2@example.com',
        });

        // Create sessions for both users
        await createDirectSession({ userId: user1.id, organizationId: org1.id });
        await createDirectSession({ userId: user2.id, organizationId: org2.id });

        const cookie1 = await loginAndGetCookie(user1.email, VALID_PASSWORD);
        const cookie2 = await loginAndGetCookie(user2.email, VALID_PASSWORD);

        // User1 revokes all their other sessions
        await supertest(app).delete('/auth/sessions').set('Cookie', cookie1).expect(200);

        // User2's session should still work
        const response = await supertest(app).get('/auth/me').set('Cookie', cookie2).expect(200);

        expect(response.body.user.id).toBe(user2.id);
      });

      it('ignores already revoked sessions in count', async () => {
        const { user, organization } = await createTestUser();

        // Create active sessions
        await createDirectSession({ userId: user.id, organizationId: organization.id });
        await createDirectSession({ userId: user.id, organizationId: organization.id });
        // Create already revoked session
        await createDirectSession({
          userId: user.id,
          organizationId: organization.id,
          revoked: true,
        });

        const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

        const response = await supertest(app)
          .delete('/auth/sessions')
          .set('Cookie', cookie)
          .expect(200);

        // Should only count the 2 active sessions, not the already revoked one
        expect(response.body.revokedCount).toBe(2);
      });
    });
  });
});
