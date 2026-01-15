/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { app } from '../../../app.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { parseSetCookie } from '../../../test/helpers/request.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 when email is missing', async () => {
      const response = await supertest(app)
        .post('/auth/login')
        .send({ password: 'somepassword' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when password is missing', async () => {
      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid email format', async () => {
      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: 'notanemail', password: 'somepassword' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when password exceeds 72 chars', async () => {
      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'a'.repeat(100) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // User Lookup Failures (401)
  // ===========================================================================

  describe('user lookup failures (401)', () => {
    it('returns 401 for non-existent email', async () => {
      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'somepassword' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('returns 401 for deleted user', async () => {
      const { user } = await createTestUser({ deleted: true });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('returns 401 for deleted organization', async () => {
      const { user } = await createTestUser({ organizationDeleted: true });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('handles email case-insensitively', async () => {
      await createTestUser({ email: 'test@example.com' });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: 'TEST@EXAMPLE.COM', password: VALID_PASSWORD })
        .expect(200);

      expect(response.body.user.email).toBe('test@example.com');
    });
  });

  // ===========================================================================
  // Account State Checks (401)
  // ===========================================================================

  describe('account state checks', () => {
    it('returns 401 when account is locked', async () => {
      const { user } = await createTestUser({
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000), // 15 min from now
      });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('succeeds when lock has expired', async () => {
      const { user } = await createTestUser({
        lockedUntil: new Date(Date.now() - 1000), // 1 sec ago
      });

      await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);
    });

    it('returns 401 for OAuth-only account (no password)', async () => {
      const { user } = await createTestUser({ password: null });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: 'anypassword' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid email or password');
    });
  });

  // ===========================================================================
  // Password Verification (401)
  // ===========================================================================

  describe('password verification', () => {
    it('returns 401 for wrong password', async () => {
      const { user } = await createTestUser();

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: 'wrongpassword' })
        .expect(401);

      expect(response.body.error.message).toBe('Invalid email or password');
    });
  });

  // ===========================================================================
  // Post-Password Checks (403)
  // ===========================================================================

  describe('post-password checks', () => {
    it('returns 403 EMAIL_NOT_VERIFIED for unverified email', async () => {
      const { user } = await createTestUser({ emailVerified: false });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(403);

      expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('returns 403 FORBIDDEN for inactive account', async () => {
      const { user } = await createTestUser({ isActive: false });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toBe('Account has been deactivated');
    });
  });

  // ===========================================================================
  // Successful Login (200)
  // ===========================================================================

  describe('successful login', () => {
    it('returns 200 with user and permissions', async () => {
      const { user, organization, role } = await createTestUser({
        permissionNames: ['contacts:read', 'contacts:write'],
      });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);

      expect(response.body.user).toMatchObject({
        id: user.id,
        email: user.email,
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        role: {
          id: role.id,
          name: role.name,
        },
      });
      expect(response.body.permissions).toContain('contacts:read');
      expect(response.body.permissions).toContain('contacts:write');
    });

    it('sets httpOnly session cookie', async () => {
      const { user } = await createTestUser();

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);

      const cookie = parseSetCookie(response.headers);
      expect(cookie).not.toBeNull();
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.value).toBeTruthy();
      expect(cookie?.value.length).toBeGreaterThan(0);
    });

    it('sets 24h cookie maxAge for rememberMe=false', async () => {
      const { user } = await createTestUser();

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD, rememberMe: false })
        .expect(200);

      const cookie = parseSetCookie(response.headers);
      expect(cookie?.maxAge).toBe(24 * 60 * 60); // 24 hours in seconds
    });

    it('sets 30d cookie maxAge for rememberMe=true', async () => {
      const { user } = await createTestUser();

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD, rememberMe: true })
        .expect(200);

      const cookie = parseSetCookie(response.headers);
      expect(cookie?.maxAge).toBe(30 * 24 * 60 * 60); // 30 days in seconds
    });

    it('returns default profile when none exists', async () => {
      const { user } = await createTestUser({ withProfile: false });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);

      expect(response.body.user.profile).toEqual({
        firstName: '',
        lastName: '',
        phone: null,
      });
    });

    it('returns profile data when exists', async () => {
      const { user } = await createTestUser({
        firstName: 'John',
        lastName: 'Doe',
      });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);

      expect(response.body.user.profile).toMatchObject({
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('returns empty permissions array for role with no permissions', async () => {
      const { user } = await createTestUser();

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);

      expect(response.body.permissions).toEqual([]);
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape', () => {
    it('has correct user structure', async () => {
      const { user } = await createTestUser({
        firstName: 'Jane',
        lastName: 'Smith',
      });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);

      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email');
      expect(response.body.user).toHaveProperty('profile');
      expect(response.body.user).toHaveProperty('organization');
      expect(response.body.user).toHaveProperty('role');
      expect(response.body.user.profile).toHaveProperty('firstName');
      expect(response.body.user.profile).toHaveProperty('lastName');
      expect(response.body.user.profile).toHaveProperty('phone');
      expect(response.body.user.organization).toHaveProperty('id');
      expect(response.body.user.organization).toHaveProperty('name');
      expect(response.body.user.organization).toHaveProperty('slug');
      expect(response.body.user.role).toHaveProperty('id');
      expect(response.body.user.role).toHaveProperty('name');
    });

    it('permissions is an array of strings', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });

      const response = await supertest(app)
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);

      expect(Array.isArray(response.body.permissions)).toBe(true);
      expect(response.body.permissions.every((p: unknown) => typeof p === 'string')).toBe(true);
    });
  });
});
