/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { getAllPermissions } from '../../../test/helpers/role.js';
import { users } from '../../../db/schema/index.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('GET /rbac/permissions', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).get('/rbac/permissions').expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000, // Expired
      });

      const response = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', cookie)
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // ===========================================================================
  // Forbidden Errors (403)
  // ===========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without roles:read permission', async () => {
      const { user } = await createTestUser(); // No permissions
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Deactivate account
      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // ===========================================================================
  // Success (200)
  // ===========================================================================

  describe('success (200)', () => {
    it('returns 200 with permissions array', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body).toHaveProperty('permissions');
      expect(Array.isArray(response.body.permissions)).toBe(true);
    });

    it('returns all seeded permissions', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Get all permissions from DB
      const allPermissions = await getAllPermissions();

      const response = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.permissions.length).toBe(allPermissions.length);
    });

    it('permission has correct fields', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.permissions.length).toBeGreaterThan(0);
      const permission = response.body.permissions[0];
      expect(permission).toHaveProperty('id');
      expect(permission).toHaveProperty('name');
      expect(permission).toHaveProperty('description');
    });

    it('permissions are sorted by name', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', cookie)
        .expect(200);

      const names = response.body.permissions.map((p: { name: string }) => p.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    it('returns same permissions for different orgs', async () => {
      // Create user in org 1
      const { user: user1 } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie1 = await loginAndGetCookie(user1.email, VALID_PASSWORD);

      // Create user in org 2
      const { user: user2 } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie2 = await loginAndGetCookie(user2.email, VALID_PASSWORD);

      const response1 = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', cookie1)
        .expect(200);

      const response2 = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', cookie2)
        .expect(200);

      // Permissions are global - same for both orgs
      expect(response1.body.permissions.length).toBe(response2.body.permissions.length);
      expect(response1.body.permissions.map((p: { id: string }) => p.id).sort()).toEqual(
        response2.body.permissions.map((p: { id: string }) => p.id).sort()
      );
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape validation', () => {
    it('permission object has correct structure', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/rbac/permissions')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.permissions.length).toBeGreaterThan(0);
      const permission = response.body.permissions[0];
      expect(typeof permission.id).toBe('string');
      expect(typeof permission.name).toBe('string');
      // description can be string or null
      expect(permission.description === null || typeof permission.description === 'string').toBe(
        true
      );
    });
  });
});
