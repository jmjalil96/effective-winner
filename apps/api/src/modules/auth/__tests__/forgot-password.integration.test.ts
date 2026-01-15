/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import { app } from '../../../app.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import {
  getAllPasswordResetTokensForUser,
  createPasswordResetToken,
} from '../../../test/helpers/token.js';
import { PASSWORD_RESET_TOKEN_EXPIRY_HOURS } from '../constants.js';

// Get email queue mock
import * as emailJobs from '../../../lib/services/email/jobs.js';

describe('POST /auth/forgot-password', () => {
  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 for missing email', async () => {
      const response = await supertest(app).post('/auth/forgot-password').send({}).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid email format', async () => {
      const response = await supertest(app)
        .post('/auth/forgot-password')
        .send({ email: 'notanemail' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // Generic Success (200) - No Information Leak
  // ===========================================================================

  describe('generic success responses (no info leak)', () => {
    it('returns 200 for non-existent email', async () => {
      const response = await supertest(app)
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toBe('If an account exists, a reset email has been sent');

      // Should NOT queue email
      expect(emailJobs.queuePasswordResetEmail).not.toHaveBeenCalled();
    });

    it('returns 200 for deleted user', async () => {
      const { user } = await createTestUser({ deleted: true });

      const response = await supertest(app)
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.message).toBe('If an account exists, a reset email has been sent');
      expect(emailJobs.queuePasswordResetEmail).not.toHaveBeenCalled();
    });

    it('returns 200 for deleted organization', async () => {
      const { user } = await createTestUser({ organizationDeleted: true });

      const response = await supertest(app)
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.message).toBe('If an account exists, a reset email has been sent');
      expect(emailJobs.queuePasswordResetEmail).not.toHaveBeenCalled();
    });

    it('returns 200 for OAuth-only user (no password)', async () => {
      const { user } = await createTestUser({ password: null });

      const response = await supertest(app)
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.message).toBe('If an account exists, a reset email has been sent');
      expect(emailJobs.queuePasswordResetEmail).not.toHaveBeenCalled();
    });

    it('returns 200 for inactive user', async () => {
      const { user } = await createTestUser({ isActive: false });

      const response = await supertest(app)
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.message).toBe('If an account exists, a reset email has been sent');
      expect(emailJobs.queuePasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Actual Token Creation (200)
  // ===========================================================================

  describe('token creation for valid user', () => {
    it('creates reset token for valid user', async () => {
      const { user } = await createTestUser();

      await supertest(app).post('/auth/forgot-password').send({ email: user.email }).expect(200);

      const tokens = await getAllPasswordResetTokensForUser(user.id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.tokenHash).toBeTruthy();
      expect(tokens[0]!.usedAt).toBeNull();
    });

    it('invalidates old tokens when creating new one', async () => {
      const { user } = await createTestUser();

      // Create an existing token
      const oldToken = await createPasswordResetToken({ userId: user.id });

      // Request new token
      await supertest(app).post('/auth/forgot-password').send({ email: user.email }).expect(200);

      // Old token should be deleted, new one created
      const tokens = await getAllPasswordResetTokensForUser(user.id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.tokenHash).not.toBe(oldToken.tokenHash);
    });

    it('sets token expiration to ~1 hour', async () => {
      const now = Date.now();
      const { user } = await createTestUser();

      await supertest(app).post('/auth/forgot-password').send({ email: user.email }).expect(200);

      const tokens = await getAllPasswordResetTokensForUser(user.id);
      const expectedExpiry = now + PASSWORD_RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
      const actualExpiry = tokens[0]!.expiresAt.getTime();

      // Allow 5 second tolerance for test execution time
      expect(actualExpiry).toBeGreaterThan(expectedExpiry - 5000);
      expect(actualExpiry).toBeLessThan(expectedExpiry + 5000);
    });

    it('queues password reset email with correct parameters', async () => {
      const { user, organization } = await createTestUser({ firstName: 'John' });

      await supertest(app).post('/auth/forgot-password').send({ email: user.email }).expect(200);

      expect(emailJobs.queuePasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(emailJobs.queuePasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: user.email,
          firstName: 'John',
          expiresInHours: PASSWORD_RESET_TOKEN_EXPIRY_HOURS,
          orgName: organization.name,
          resetUrl: expect.stringContaining('/reset-password?token='),
        })
      );
    });

    it('handles email case-insensitively', async () => {
      const { user } = await createTestUser({ email: 'test@example.com' });

      await supertest(app)
        .post('/auth/forgot-password')
        .send({ email: 'TEST@EXAMPLE.COM' })
        .expect(200);

      // Should still create token
      const tokens = await getAllPasswordResetTokensForUser(user.id);
      expect(tokens).toHaveLength(1);
      expect(emailJobs.queuePasswordResetEmail).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Email Queue Failure
  // ===========================================================================

  describe('email queue failure', () => {
    it('request succeeds even if email queue fails (fire-and-forget)', async () => {
      vi.mocked(emailJobs.queuePasswordResetEmail).mockRejectedValueOnce(
        new Error('Queue connection failed')
      );

      const { user } = await createTestUser();

      const response = await supertest(app)
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.message).toBe('If an account exists, a reset email has been sent');

      // Token should still be created
      const tokens = await getAllPasswordResetTokensForUser(user.id);
      expect(tokens).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Multiple Requests
  // ===========================================================================

  describe('multiple requests', () => {
    it('handles multiple consecutive forgot-password requests', async () => {
      const { user } = await createTestUser();

      // Send multiple requests
      await supertest(app).post('/auth/forgot-password').send({ email: user.email }).expect(200);

      await supertest(app).post('/auth/forgot-password').send({ email: user.email }).expect(200);

      // Should only have one token (previous invalidated)
      const tokens = await getAllPasswordResetTokensForUser(user.id);
      expect(tokens).toHaveLength(1);
    });
  });
});
