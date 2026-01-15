/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { users, organizations } from '../../../db/schema.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('GET /auth/me', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).get('/auth/me').expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .get('/auth/me')
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with empty session cookie', async () => {
      const response = await supertest(app).get('/auth/me').set('Cookie', 'sid=').expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with wrong cookie name', async () => {
      const response = await supertest(app)
        .get('/auth/me')
        .set('Cookie', 'session=somevalue')
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

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });

    it('returns 401 with revoked session', async () => {
      const { user, organization } = await createTestUser();

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        revoked: true,
      });

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Session revoked');
    });

    it('returns 401 when user is deleted', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Soft-delete the user
      const db = getTestDb();
      await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.id));

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 when organization is deleted', async () => {
      const { user, organization } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Soft-delete the organization
      const db = getTestDb();
      await db
        .update(organizations)
        .set({ deletedAt: new Date() })
        .where(eq(organizations.id, organization.id));

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
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

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // ===========================================================================
  // Success (200)
  // ===========================================================================

  describe('success (200)', () => {
    it('returns 200 with user and permissions', async () => {
      const { user } = await createTestUser({ permissionNames: ['contacts:read'] });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('permissions');
      expect(Array.isArray(response.body.permissions)).toBe(true);
    });

    it('returns correct user.id', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body.user.id).toBe(user.id);
    });

    it('returns correct user.email (lowercase)', async () => {
      const { user } = await createTestUser({ email: 'test@example.com' });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body.user.email).toBe('test@example.com');
    });

    it('returns profile with firstName, lastName, phone', async () => {
      const { user } = await createTestUser({
        firstName: 'John',
        lastName: 'Doe',
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body.user.profile).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        phone: null,
      });
    });

    it('returns default profile when none exists', async () => {
      const { user } = await createTestUser({ withProfile: false });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body.user.profile).toEqual({
        firstName: '',
        lastName: '',
        phone: null,
      });
    });

    it('returns organization.id, name, slug', async () => {
      const { user, organization } = await createTestUser({
        organizationName: 'Test Company',
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body.user.organization.id).toBe(organization.id);
      expect(response.body.user.organization.name).toBe('Test Company');
      expect(response.body.user.organization.slug).toBeTruthy();
    });

    it('returns role.id and role.name', async () => {
      const { user, role } = await createTestUser({ roleName: 'Admin' });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body.user.role.id).toBe(role.id);
      expect(response.body.user.role.name).toBe('Admin');
    });

    it('returns permissions array with assigned permissions', async () => {
      const { user } = await createTestUser({
        permissionNames: ['contacts:read', 'contacts:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body.permissions).toContain('contacts:read');
      expect(response.body.permissions).toContain('contacts:write');
    });

    it('returns empty permissions array when none assigned', async () => {
      const { user } = await createTestUser(); // No permissionNames
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body.permissions).toEqual([]);
    });

    it('does not include passwordHash in response', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('does not include session secrets in response', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body).not.toHaveProperty('sidHash');
      expect(response.body).not.toHaveProperty('sessionId');
      expect(JSON.stringify(response.body)).not.toContain('sidHash');
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape validation', () => {
    it('user object has correct structure', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email');
      expect(response.body.user).toHaveProperty('profile');
      expect(response.body.user).toHaveProperty('organization');
      expect(response.body.user).toHaveProperty('role');
    });

    it('permissions is array of strings', async () => {
      const { user } = await createTestUser({
        permissionNames: ['contacts:read', 'users:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/auth/me').set('Cookie', cookie).expect(200);

      expect(Array.isArray(response.body.permissions)).toBe(true);
      response.body.permissions.forEach((p: unknown) => {
        expect(typeof p).toBe('string');
      });
    });
  });
});
