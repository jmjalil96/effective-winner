/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { profiles, users } from '../../../db/schema/index.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('PATCH /auth/profile', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).patch('/auth/profile').send({}).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', 'sid=invalidsessionid123')
        .send({})
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with empty session cookie', async () => {
      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', 'sid=')
        .send({})
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

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({})
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
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({})
        .expect(401);

      expect(response.body.error.message).toBe('Session revoked');
    });
  });

  // ===========================================================================
  // Forbidden Errors (403)
  // ===========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Deactivate the account
      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ firstName: 'New' })
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 when firstName is empty string', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ firstName: '' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when firstName exceeds 255 chars', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ firstName: 'a'.repeat(256) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when lastName is empty string', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ lastName: '' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when lastName exceeds 255 chars', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ lastName: 'a'.repeat(256) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when phone exceeds 50 chars', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ phone: '1'.repeat(51) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // Success (200)
  // ===========================================================================

  describe('success (200)', () => {
    it('returns 200 with updated profile', async () => {
      const { user } = await createTestUser({ firstName: 'Original', lastName: 'Name' });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(200);

      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile.firstName).toBe('Updated');
    });

    it('updates firstName only', async () => {
      const { user } = await createTestUser({ firstName: 'Original', lastName: 'LastName' });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ firstName: 'NewFirst' })
        .expect(200);

      expect(response.body.profile.firstName).toBe('NewFirst');
      expect(response.body.profile.lastName).toBe('LastName'); // Unchanged
    });

    it('updates lastName only', async () => {
      const { user } = await createTestUser({ firstName: 'FirstName', lastName: 'Original' });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ lastName: 'NewLast' })
        .expect(200);

      expect(response.body.profile.firstName).toBe('FirstName'); // Unchanged
      expect(response.body.profile.lastName).toBe('NewLast');
    });

    it('updates phone only', async () => {
      const { user } = await createTestUser({ firstName: 'First', lastName: 'Last' });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ phone: '555-1234' })
        .expect(200);

      expect(response.body.profile.firstName).toBe('First'); // Unchanged
      expect(response.body.profile.lastName).toBe('Last'); // Unchanged
      expect(response.body.profile.phone).toBe('555-1234');
    });

    it('sets phone to null', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // First set a phone number
      await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ phone: '555-1234' })
        .expect(200);

      // Then set it to null
      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ phone: null })
        .expect(200);

      expect(response.body.profile.phone).toBeNull();
    });

    it('updates multiple fields', async () => {
      const { user } = await createTestUser({ firstName: 'Old', lastName: 'Name' });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ firstName: 'New', lastName: 'Person', phone: '123-4567' })
        .expect(200);

      expect(response.body.profile.firstName).toBe('New');
      expect(response.body.profile.lastName).toBe('Person');
      expect(response.body.profile.phone).toBe('123-4567');
    });

    it('creates profile if none exists', async () => {
      const { user } = await createTestUser({ withProfile: false });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Verify no profile exists
      const db = getTestDb();
      const profilesBefore = await db.select().from(profiles).where(eq(profiles.userId, user.id));
      expect(profilesBefore).toHaveLength(0);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ firstName: 'Created', lastName: 'Profile' })
        .expect(200);

      expect(response.body.profile.firstName).toBe('Created');
      expect(response.body.profile.lastName).toBe('Profile');

      // Verify profile was created
      const profilesAfter = await db.select().from(profiles).where(eq(profiles.userId, user.id));
      expect(profilesAfter).toHaveLength(1);
    });

    it('allows empty body (no changes)', async () => {
      const { user } = await createTestUser({ firstName: 'Current', lastName: 'User' });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({})
        .expect(200);

      expect(response.body.profile.firstName).toBe('Current');
      expect(response.body.profile.lastName).toBe('User');
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape validation', () => {
    it('profile object has correct structure', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ firstName: 'Test' })
        .expect(200);

      expect(response.body.profile).toHaveProperty('firstName');
      expect(response.body.profile).toHaveProperty('lastName');
      expect(response.body.profile).toHaveProperty('phone');
      expect(typeof response.body.profile.firstName).toBe('string');
      expect(typeof response.body.profile.lastName).toBe('string');
    });

    it('does not include extra user fields', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/auth/profile')
        .set('Cookie', cookie)
        .send({ firstName: 'Test' })
        .expect(200);

      expect(response.body).not.toHaveProperty('user');
      expect(response.body).not.toHaveProperty('email');
      expect(response.body).not.toHaveProperty('id');
    });
  });
});
