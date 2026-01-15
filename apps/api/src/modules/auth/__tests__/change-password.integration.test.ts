/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import {
  loginAndGetCookie,
  createDirectSession,
  getActiveSessionsByUserId,
  getSessionById,
} from '../../../test/helpers/session.js';
import { users } from '../../../db/schema.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

// Get email queue mock
import * as emailJobs from '../../../lib/services/email/jobs.js';

describe('POST /auth/change-password', () => {
  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Unauthorized Errors (401) - Not Authenticated
  // ===========================================================================

  describe('unauthorized errors (401) - not authenticated', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app)
        .post('/auth/change-password')
        .send({ currentPassword: 'oldpassword', newPassword: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', 'sid=invalidsessionid123')
        .send({ currentPassword: 'oldpassword', newPassword: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser();

      // Create expired session
      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000, // Expired 1 hour ago
      });

      const response = await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });

    it('returns 401 with revoked session', async () => {
      const { user, organization } = await createTestUser();

      // Create revoked session
      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        revoked: true,
      });

      const response = await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Session revoked');
    });
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 for missing currentPassword', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ newPassword: 'newpassword123' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for empty currentPassword', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: '', newPassword: 'newpassword123' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing newPassword', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for newPassword too short (< 8 chars)', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: '1234567' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for newPassword too long (> 72 chars)', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'a'.repeat(73) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // Unauthorized Errors (401) - Wrong Password
  // ===========================================================================

  describe('unauthorized errors (401) - wrong password', () => {
    it('returns 401 for incorrect current password', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: 'wrongpassword123', newPassword: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Current password is incorrect');
    });
  });

  // ===========================================================================
  // Successful Change (200)
  // ===========================================================================

  describe('successful change (200)', () => {
    it('returns 200 with success message', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      expect(response.body.message).toBe('Password changed successfully');
    });

    it('updates user password hash', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      const [beforeUser] = await db.select().from(users).where(eq(users.id, user.id));
      const beforeHash = beforeUser!.passwordHash;

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      const [afterUser] = await db.select().from(users).where(eq(users.id, user.id));
      expect(afterUser!.passwordHash).not.toBe(beforeHash);
    });

    it('stores password with argon2 hash', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      const db = getTestDb();
      const [afterUser] = await db.select().from(users).where(eq(users.id, user.id));
      expect(afterUser!.passwordHash).toMatch(/^\$argon2/);
    });

    it('sets passwordChangedAt timestamp', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      const [beforeUser] = await db.select().from(users).where(eq(users.id, user.id));
      const beforeTimestamp = beforeUser!.passwordChangedAt;

      const now = Date.now();

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      const [afterUser] = await db.select().from(users).where(eq(users.id, user.id));
      expect(afterUser!.passwordChangedAt).not.toBe(beforeTimestamp);
      expect(afterUser!.passwordChangedAt).not.toBeNull();
      // Should be within 5 seconds of now
      expect(afterUser!.passwordChangedAt!.getTime()).toBeGreaterThanOrEqual(now - 5000);
      expect(afterUser!.passwordChangedAt!.getTime()).toBeLessThanOrEqual(now + 5000);
    });

    it('revokes other sessions (soft-revoke)', async () => {
      const { user, organization } = await createTestUser();

      // Create multiple sessions
      const session1 = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
      });
      const session2 = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
      });

      // Login to get a "current" session
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Before change: 3 active sessions
      const beforeSessions = await getActiveSessionsByUserId(user.id);
      expect(beforeSessions.length).toBe(3);

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      // After change: only 1 active session (current)
      const afterSessions = await getActiveSessionsByUserId(user.id);
      expect(afterSessions.length).toBe(1);

      // Verify other sessions are revoked (not deleted)
      const revokedSession1 = await getSessionById(session1.recordId);
      const revokedSession2 = await getSessionById(session2.recordId);
      expect(revokedSession1).not.toBeNull();
      expect(revokedSession2).not.toBeNull();
      expect(revokedSession1!.revokedAt).not.toBeNull();
      expect(revokedSession2!.revokedAt).not.toBeNull();
    });

    it('keeps current session active', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      // Current session should still work
      const meResponse = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(meResponse.body.user.id).toBe(user.id);
    });

    it('queues password changed email', async () => {
      const { user, organization } = await createTestUser({ firstName: 'Alice' });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      expect(emailJobs.queuePasswordChangedEmail).toHaveBeenCalledTimes(1);
      expect(emailJobs.queuePasswordChangedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: user.email,
          firstName: 'Alice',
          orgName: organization.name,
        })
      );
    });
  });

  // ===========================================================================
  // Session Behavior After Change
  // ===========================================================================

  describe('session behavior after change', () => {
    it('user can continue making authenticated requests with current session', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      // Multiple subsequent authenticated requests should work
      await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);
    });

    it('user cannot use revoked session after password change', async () => {
      const { user, organization } = await createTestUser();

      // Create a session that will be revoked
      const { cookie: oldCookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
      });

      // Login to get current session
      const currentCookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Verify old session works before change
      await supertest(app).get('/auth/me').set('Cookie', oldCookie).expect(200);

      // Change password (revokes old session)
      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', currentCookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      // Old session should no longer work
      const response = await supertest(app).get('/auth/me').set('Cookie', oldCookie).expect(401);

      expect(response.body.error.message).toBe('Session revoked');
    });
  });

  // ===========================================================================
  // Post-Change Login Behavior
  // ===========================================================================

  describe('post-change login behavior', () => {
    it('user can login with new password', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const newPassword = 'newpassword123';

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword })
        .expect(200);

      // Login with new password should work
      const loginResponse = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: newPassword })
        .expect(200);

      expect(loginResponse.body.user.id).toBe(user.id);
    });

    it('user cannot login with old password', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      // Login with old password should fail
      const loginResponse = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(401);

      expect(loginResponse.body.error.message).toBe('Invalid email or password');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('accepts minimum valid newPassword (8 chars)', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: '12345678' })
        .expect(200);
    });

    it('accepts maximum valid newPassword (72 chars)', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'a'.repeat(72) })
        .expect(200);
    });

    it('allows changing password multiple times in succession', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // First change
      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'password2nd' })
        .expect(200);

      // Second change (using same session)
      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: 'password2nd', newPassword: 'password3rd' })
        .expect(200);

      // Can login with final password
      const loginResponse = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: 'password3rd' })
        .expect(200);

      expect(loginResponse.body.user.id).toBe(user.id);
    });

    it('email queue failure does not affect password change', async () => {
      vi.mocked(emailJobs.queuePasswordChangedEmail).mockRejectedValueOnce(
        new Error('Queue connection failed')
      );

      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Should still succeed
      await supertest(app)
        .post('/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'newpassword123' })
        .expect(200);

      // Password should still be changed
      const loginResponse = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: 'newpassword123' })
        .expect(200);

      expect(loginResponse.body.user.id).toBe(user.id);
    });
  });
});
