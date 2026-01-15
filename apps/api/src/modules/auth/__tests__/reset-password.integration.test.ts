/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createUserWithResetToken } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import {
  getPasswordResetTokenByUserId,
  getUserById,
  markUserDeleted,
} from '../../../test/helpers/token.js';
import { getSessionsByUserId, createDirectSession } from '../../../test/helpers/session.js';
import { users, organizations } from '../../../db/schema.js';

// Get email queue mock
import * as emailJobs from '../../../lib/services/email/jobs.js';

describe('POST /auth/reset-password', () => {
  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 for missing token', async () => {
      const response = await supertest(app)
        .post('/auth/reset-password')
        .send({ password: '12345678' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for password too short', async () => {
      const response = await supertest(app)
        .post('/auth/reset-password')
        .send({ token: 'sometoken', password: '1234567' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 for invalid token', async () => {
      const response = await supertest(app)
        .post('/auth/reset-password')
        .send({ token: 'invalidtoken123', password: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid or expired reset token');
    });

    it('returns 401 for expired token', async () => {
      const { token } = await createUserWithResetToken({
        tokenExpiresInMs: -60 * 60 * 1000, // Expired 1 hour ago
      });

      const response = await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid or expired reset token');
    });

    it('returns 401 for already used token', async () => {
      const { token } = await createUserWithResetToken({
        tokenUsed: true,
      });

      const response = await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid or expired reset token');
    });

    it('returns 401 when user is deleted', async () => {
      const { token, user } = await createUserWithResetToken();

      // Delete the user
      await markUserDeleted(user.id);

      const response = await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid or expired reset token');
    });

    it('returns 401 when organization is deleted', async () => {
      const { token, organization } = await createUserWithResetToken();

      // Delete the organization
      const db = getTestDb();
      await db
        .update(organizations)
        .set({ deletedAt: new Date() })
        .where(eq(organizations.id, organization.id));

      const response = await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid or expired reset token');
    });

    it('returns 401 for inactive user', async () => {
      const { token } = await createUserWithResetToken({
        isActive: false,
      });

      const response = await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid or expired reset token');
    });
  });

  // ===========================================================================
  // Successful Reset (200)
  // ===========================================================================

  describe('successful reset (200)', () => {
    it('returns 200 with success message', async () => {
      const { token } = await createUserWithResetToken();

      const response = await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(200);

      expect(response.body.message).toBe('Password has been reset successfully');
    });

    it('updates user password hash', async () => {
      const { token, user } = await createUserWithResetToken();

      const beforeUser = await getUserById(user.id);
      const beforeHash = beforeUser?.passwordHash;

      await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(200);

      const afterUser = await getUserById(user.id);
      expect(afterUser?.passwordHash).not.toBe(beforeHash);
    });

    it('marks token as used', async () => {
      const { token, user } = await createUserWithResetToken();

      const beforeToken = await getPasswordResetTokenByUserId(user.id);
      expect(beforeToken?.usedAt).toBeNull();

      await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(200);

      const afterToken = await getPasswordResetTokenByUserId(user.id);
      expect(afterToken?.usedAt).not.toBeNull();
    });

    it('deletes all user sessions', async () => {
      const { token, user, organization } = await createUserWithResetToken();

      // Create some sessions for the user
      await createDirectSession({ userId: user.id, organizationId: organization.id });
      await createDirectSession({ userId: user.id, organizationId: organization.id });

      const beforeSessions = await getSessionsByUserId(user.id);
      expect(beforeSessions.length).toBe(2);

      await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(200);

      const afterSessions = await getSessionsByUserId(user.id);
      expect(afterSessions.length).toBe(0);
    });

    it('queues password changed email', async () => {
      const { token, user, organization } = await createUserWithResetToken({
        firstName: 'Jane',
      });

      await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(200);

      expect(emailJobs.queuePasswordChangedEmail).toHaveBeenCalledTimes(1);
      expect(emailJobs.queuePasswordChangedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: user.email,
          firstName: 'Jane',
          orgName: organization.name,
        })
      );
    });

    it('stores password hashed (argon2)', async () => {
      const { token, user } = await createUserWithResetToken();

      await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(200);

      const db = getTestDb();
      const userList = await db.select().from(users).where(eq(users.id, user.id));
      expect(userList[0]!.passwordHash).toMatch(/^\$argon2/);
    });
  });

  // ===========================================================================
  // Concurrent Reset Handling
  // ===========================================================================

  describe('concurrent reset handling', () => {
    it('handles concurrent reset attempts', async () => {
      const { token } = await createUserWithResetToken();

      const [response1, response2, response3] = await Promise.all([
        supertest(app).post('/auth/reset-password').send({ token, password: 'newpassword1' }),
        supertest(app).post('/auth/reset-password').send({ token, password: 'newpassword2' }),
        supertest(app).post('/auth/reset-password').send({ token, password: 'newpassword3' }),
      ]);

      const statuses = [response1.status, response2.status, response3.status].sort();

      // One should succeed (200), others should fail (401)
      expect(statuses).toContain(200);
      expect(statuses.filter((s) => s === 401).length).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // Post-Reset Behavior
  // ===========================================================================

  describe('post-reset behavior', () => {
    it('user can login with new password', async () => {
      const { token, user } = await createUserWithResetToken();
      const newPassword = 'newpassword123';

      await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: newPassword })
        .expect(200);

      // Login with new password should work
      const loginResponse = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: newPassword })
        .expect(200);

      expect(loginResponse.body.user.id).toBe(user.id);
    });

    it('user cannot login with old password', async () => {
      const { token, user, password: oldPassword } = await createUserWithResetToken();

      await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(200);

      // Login with old password should fail
      const loginResponse = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: oldPassword })
        .expect(401);

      expect(loginResponse.body.error.message).toBe('Invalid email or password');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles token just before expiration', async () => {
      const { token } = await createUserWithResetToken({
        tokenExpiresInMs: 60 * 1000, // 1 minute from now
      });

      await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(200);
    });

    it('accepts minimum valid password (8 chars)', async () => {
      const { token } = await createUserWithResetToken();

      await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: '12345678' })
        .expect(200);
    });

    it('accepts maximum valid password (72 chars)', async () => {
      const { token } = await createUserWithResetToken();

      await supertest(app)
        .post('/auth/reset-password')
        .send({ token, password: 'a'.repeat(72) })
        .expect(200);
    });
  });
});
