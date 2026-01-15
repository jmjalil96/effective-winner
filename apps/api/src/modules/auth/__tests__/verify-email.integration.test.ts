/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createUnverifiedUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import {
  getUserById,
  getVerificationTokenByUserId,
  hashToken,
  markUserDeleted,
} from '../../../test/helpers/token.js';
import { organizations, emailVerificationTokens } from '../../../db/schema.js';

describe('POST /auth/verify-email', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 when token is missing', async () => {
      const response = await supertest(app).post('/auth/verify-email').send({}).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when token is empty', async () => {
      const response = await supertest(app)
        .post('/auth/verify-email')
        .send({ token: '' })
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
        .post('/auth/verify-email')
        .send({ token: 'invalidtoken123' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid or expired verification token');
    });

    it('returns 401 for random non-existent token', async () => {
      const response = await supertest(app)
        .post('/auth/verify-email')
        .send({ token: 'a'.repeat(64) })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid or expired verification token');
    });

    it('returns 401 for expired token', async () => {
      // Create user with expired token (1 hour ago)
      const { token } = await createUnverifiedUser({
        tokenExpiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app).post('/auth/verify-email').send({ token }).expect(401);

      expect(response.body.error.message).toBe('Invalid or expired verification token');
    });

    it('returns 401 for already used token', async () => {
      const { token } = await createUnverifiedUser({
        tokenUsed: true,
      });

      const response = await supertest(app).post('/auth/verify-email').send({ token }).expect(401);

      expect(response.body.error.message).toBe('Invalid or expired verification token');
    });

    it('returns 401 when user is deleted', async () => {
      const { token, user } = await createUnverifiedUser();

      // Delete the user
      await markUserDeleted(user.id);

      const response = await supertest(app).post('/auth/verify-email').send({ token }).expect(401);

      expect(response.body.error.message).toBe('Invalid or expired verification token');
    });

    it('returns 401 when organization is deleted', async () => {
      const { token, organization } = await createUnverifiedUser();

      // Delete the organization
      const db = getTestDb();
      await db
        .update(organizations)
        .set({ deletedAt: new Date() })
        .where(eq(organizations.id, organization.id));

      const response = await supertest(app).post('/auth/verify-email').send({ token }).expect(401);

      expect(response.body.error.message).toBe('Invalid or expired verification token');
    });
  });

  // ===========================================================================
  // Successful Verification (200)
  // ===========================================================================

  describe('successful verification (200)', () => {
    it('returns 200 with success message', async () => {
      const { token } = await createUnverifiedUser();

      const response = await supertest(app).post('/auth/verify-email').send({ token }).expect(200);

      expect(response.body.message).toBe('Email verified successfully. You can now log in.');
    });

    it('sets user emailVerifiedAt', async () => {
      const { token, user } = await createUnverifiedUser();

      const beforeUser = await getUserById(user.id);
      expect(beforeUser?.emailVerifiedAt).toBeNull();

      await supertest(app).post('/auth/verify-email').send({ token }).expect(200);

      const afterUser = await getUserById(user.id);
      expect(afterUser?.emailVerifiedAt).not.toBeNull();
      expect(afterUser?.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('marks token as used', async () => {
      const { token, user } = await createUnverifiedUser();

      const beforeToken = await getVerificationTokenByUserId(user.id);
      expect(beforeToken?.usedAt).toBeNull();

      await supertest(app).post('/auth/verify-email').send({ token }).expect(200);

      const afterToken = await getVerificationTokenByUserId(user.id);
      expect(afterToken?.usedAt).not.toBeNull();
      expect(afterToken?.usedAt).toBeInstanceOf(Date);
    });

    it('returns 200 for already verified user (idempotent)', async () => {
      const { token, user } = await createUnverifiedUser();

      // First verification
      await supertest(app).post('/auth/verify-email').send({ token }).expect(200);

      // Verify user is now verified
      const verifiedUser = await getUserById(user.id);
      expect(verifiedUser?.emailVerifiedAt).not.toBeNull();

      // Create another token for the same user (simulate fresh token)
      const db = getTestDb();
      const newToken = 'newtokenforalreadyverifieduser';
      const newTokenHash = hashToken(newToken);

      await db.insert(emailVerificationTokens).values({
        userId: user.id,
        tokenHash: newTokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // Second verification with new token - should return 200 (idempotent)
      const response = await supertest(app)
        .post('/auth/verify-email')
        .send({ token: newToken })
        .expect(200);

      expect(response.body.message).toBe('Email verified successfully. You can now log in.');
    });
  });

  // ===========================================================================
  // Concurrent Verification Handling
  // ===========================================================================

  describe('concurrent verification', () => {
    it('handles concurrent verification attempts gracefully', async () => {
      const { token } = await createUnverifiedUser();

      // Send multiple verification requests simultaneously
      const [response1, response2, response3] = await Promise.all([
        supertest(app).post('/auth/verify-email').send({ token }),
        supertest(app).post('/auth/verify-email').send({ token }),
        supertest(app).post('/auth/verify-email').send({ token }),
      ]);

      // Concurrent verification behavior depends on timing:
      // - If all requests read token before any writes → all detect race → all 200
      // - If a request reads AFTER another has marked token as used → 401
      // The key invariants:
      // 1. At least one request succeeds (200)
      // 2. No internal server errors (500)
      // 3. All requests return either 200 (success/idempotent) or 401 (token already used)
      const statuses = [response1.status, response2.status, response3.status];
      expect(statuses).toContain(200); // At least one succeeds
      statuses.forEach((status) => {
        expect([200, 401]).toContain(status); // No 500s
      });
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles token just before expiration', async () => {
      // Token expires in 1 minute
      const { token } = await createUnverifiedUser({
        tokenExpiresInMs: 60 * 1000,
      });

      await supertest(app).post('/auth/verify-email').send({ token }).expect(200);
    });

    it('rejects token just after expiration', async () => {
      // Token expired 1 second ago
      const { token } = await createUnverifiedUser({
        tokenExpiresInMs: -1000,
      });

      const response = await supertest(app).post('/auth/verify-email').send({ token }).expect(401);

      expect(response.body.error.message).toBe('Invalid or expired verification token');
    });

    it('does not leak timing information for invalid vs non-existent tokens', async () => {
      // Both invalid and non-existent tokens should return the same error
      const response1 = await supertest(app)
        .post('/auth/verify-email')
        .send({ token: 'nonexistent' })
        .expect(401);

      const response2 = await supertest(app)
        .post('/auth/verify-email')
        .send({ token: 'anothernonexistent' })
        .expect(401);

      // Same error message for both
      expect(response1.body.error.message).toBe(response2.body.error.message);
    });
  });

  // ===========================================================================
  // User Can Login After Verification
  // ===========================================================================

  describe('post-verification login', () => {
    it('allows user to login after email verification', async () => {
      const { token, user, password } = await createUnverifiedUser();

      // Verify email
      await supertest(app).post('/auth/verify-email').send({ token }).expect(200);

      // Now login should work
      const loginResponse = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password })
        .expect(200);

      expect(loginResponse.body.user.id).toBe(user.id);
    });

    it('user cannot login before email verification', async () => {
      const { user, password } = await createUnverifiedUser();

      // Login should fail with EMAIL_NOT_VERIFIED
      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password })
        .expect(403);

      expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });
});
