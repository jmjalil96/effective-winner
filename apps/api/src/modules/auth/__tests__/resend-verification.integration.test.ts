/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import { app } from '../../../app.js';
import { createTestUser, createUnverifiedUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { getAllVerificationTokensForUser } from '../../../test/helpers/token.js';

// Get email queue mock
import * as emailJobs from '../../../lib/services/email/jobs.js';

describe('POST /auth/resend-verification', () => {
  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 when email is missing', async () => {
      const response = await supertest(app).post('/auth/resend-verification').send({}).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid email format', async () => {
      const response = await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: 'notanemail' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // Generic Success Responses (200) - No Information Leak
  // ===========================================================================

  describe('generic success responses (no info leak)', () => {
    it('returns 200 for non-existent email (no info leak)', async () => {
      const response = await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.sent).toBe(true);
      expect(response.body.message).toBe(
        'If this email is registered and unverified, a verification email has been sent.'
      );

      // Should NOT queue email
      expect(emailJobs.queueEmailVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns 200 for deleted user (no info leak)', async () => {
      const { user } = await createUnverifiedUser({ deleted: true });

      const response = await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.sent).toBe(true);
      expect(response.body.message).toBe(
        'If this email is registered and unverified, a verification email has been sent.'
      );

      // Should NOT queue email
      expect(emailJobs.queueEmailVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns 200 for deleted organization (no info leak)', async () => {
      const { user } = await createUnverifiedUser({ organizationDeleted: true });

      const response = await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.sent).toBe(true);

      // Should NOT queue email
      expect(emailJobs.queueEmailVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns 200 for already verified user (no info leak)', async () => {
      // Create a verified user
      const { user } = await createTestUser({ emailVerified: true });

      const response = await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.sent).toBe(true);
      expect(response.body.message).toBe(
        'If this email is registered and unverified, a verification email has been sent.'
      );

      // Should NOT queue email
      expect(emailJobs.queueEmailVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns 200 for inactive user (no info leak)', async () => {
      const { user } = await createUnverifiedUser({ isActive: false });

      const response = await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.sent).toBe(true);
      expect(response.body.message).toBe(
        'If this email is registered and unverified, a verification email has been sent.'
      );

      // Should NOT queue email
      expect(emailJobs.queueEmailVerificationEmail).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Actual Resend (200)
  // ===========================================================================

  describe('actual resend for unverified user', () => {
    it('creates new verification token', async () => {
      const { user } = await createUnverifiedUser();

      await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      // Should have created a new token
      const tokens = await getAllVerificationTokensForUser(user.id);
      expect(tokens.length).toBeGreaterThanOrEqual(1);
    });

    it('invalidates old tokens and creates new one', async () => {
      const { user, tokenHash: oldTokenHash } = await createUnverifiedUser();

      // Get initial token count
      const tokensBefore = await getAllVerificationTokensForUser(user.id);
      expect(tokensBefore).toHaveLength(1);

      await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      // Old tokens should be deleted, new one created
      const tokensAfter = await getAllVerificationTokensForUser(user.id);
      expect(tokensAfter).toHaveLength(1);

      // The new token should be different from the old one
      expect(tokensAfter[0]!.tokenHash).not.toBe(oldTokenHash);
    });

    it('queues verification email', async () => {
      const { user, organization } = await createUnverifiedUser({
        firstName: 'Jane',
      });

      await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      expect(emailJobs.queueEmailVerificationEmail).toHaveBeenCalledTimes(1);
      expect(emailJobs.queueEmailVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: user.email,
          firstName: 'Jane',
          orgName: organization.name,
          verifyUrl: expect.stringContaining('/verify-email?token='),
        })
      );
    });

    it('returns success response with "sent" message', async () => {
      const { user } = await createUnverifiedUser();

      const response = await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.sent).toBe(true);
      expect(response.body.alreadyVerified).toBe(false);
      expect(response.body.message).toBe(
        'Verification email sent. Please check your inbox and spam folder.'
      );
    });

    it('handles email case-insensitively', async () => {
      const { user } = await createUnverifiedUser({ email: 'test@example.com' });

      await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: 'TEST@EXAMPLE.COM' })
        .expect(200);

      // Should still queue email
      expect(emailJobs.queueEmailVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: user.email, // Original lowercase email
        })
      );
    });
  });

  // ===========================================================================
  // Email Queue Failure
  // ===========================================================================

  describe('email queue failure', () => {
    it('resend succeeds even if email queue fails (fire-and-forget)', async () => {
      vi.mocked(emailJobs.queueEmailVerificationEmail).mockRejectedValueOnce(
        new Error('Queue connection failed')
      );

      const { user } = await createUnverifiedUser();

      // Resend should still succeed
      const response = await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      expect(response.body.sent).toBe(true);
    });
  });

  // ===========================================================================
  // Multiple Resend Requests
  // ===========================================================================

  describe('multiple resend requests', () => {
    it('handles multiple consecutive resend requests', async () => {
      const { user } = await createUnverifiedUser();

      // Send multiple requests
      await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      // All should succeed
      expect(emailJobs.queueEmailVerificationEmail).toHaveBeenCalledTimes(3);

      // Should only have one active token (latest)
      const tokens = await getAllVerificationTokensForUser(user.id);
      expect(tokens).toHaveLength(1);
    });

    it('handles concurrent resend requests', async () => {
      const { user } = await createUnverifiedUser();

      const [response1, response2] = await Promise.all([
        supertest(app).post('/auth/resend-verification').send({ email: user.email }),
        supertest(app).post('/auth/resend-verification').send({ email: user.email }),
      ]);

      // Both should succeed
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape', () => {
    it('has correct response structure for actual resend', async () => {
      const { user } = await createUnverifiedUser();

      const response = await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: user.email })
        .expect(200);

      expect(response.body).toHaveProperty('sent');
      expect(response.body).toHaveProperty('alreadyVerified');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.sent).toBe('boolean');
      expect(typeof response.body.alreadyVerified).toBe('boolean');
      expect(typeof response.body.message).toBe('string');
    });

    it('has correct response structure for non-existent user', async () => {
      const response = await supertest(app)
        .post('/auth/resend-verification')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body).toHaveProperty('sent');
      expect(response.body).toHaveProperty('alreadyVerified');
      expect(response.body).toHaveProperty('message');
    });
  });
});
