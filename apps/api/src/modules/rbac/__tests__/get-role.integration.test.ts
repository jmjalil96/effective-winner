/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import {
  createTestRole,
  softDeleteRole,
  addPermissionsToRole,
  getAllPermissions,
} from '../../../test/helpers/role.js';
import { users } from '../../../db/schema/index.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('GET /rbac/roles/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).get(`/rbac/roles/${uuidv7()}`).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .get(`/rbac/roles/${uuidv7()}`)
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
        .get(`/rbac/roles/${uuidv7()}`)
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
      const { user, organization } = await createTestUser(); // No permissions
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .get(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      // Deactivate account
      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .get(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 for non-UUID id', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/rbac/roles/not-a-uuid')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // Not Found Errors (404)
  // ===========================================================================

  describe('not found errors (404)', () => {
    it('returns 404 for non-existent id', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get(`/rbac/roles/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for soft-deleted role', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      await softDeleteRole(role.id);

      const response = await supertest(app)
        .get(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for another org role', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create role in different org
      const { organization: otherOrg } = await createTestUser();
      const { role: otherRole } = await createTestRole({ organizationId: otherOrg.id });

      const response = await supertest(app)
        .get(`/rbac/roles/${otherRole.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });
  });

  // ===========================================================================
  // Success (200)
  // ===========================================================================

  describe('success (200)', () => {
    it('returns 200 with role and permissions', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .get(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body).toHaveProperty('role');
      expect(response.body.role).toHaveProperty('permissions');
    });

    it('role has correct fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({
        organizationId: organization.id,
        name: 'TestRole',
        description: 'Test description',
      });

      const response = await supertest(app)
        .get(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.role.id).toBe(role.id);
      expect(response.body.role.name).toBe('TestRole');
      expect(response.body.role.description).toBe('Test description');
      expect(response.body.role).toHaveProperty('isDefault');
      expect(response.body.role).toHaveProperty('createdAt');
      expect(response.body.role).toHaveProperty('permissions');
    });

    it('permissions array contains permission objects', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      // Add some permissions
      const allPerms = await getAllPermissions();
      if (allPerms.length > 0) {
        await addPermissionsToRole(role.id, [allPerms[0]!.id]);
      }

      const response = await supertest(app)
        .get(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(Array.isArray(response.body.role.permissions)).toBe(true);
      if (response.body.role.permissions.length > 0) {
        const perm = response.body.role.permissions[0];
        expect(perm).toHaveProperty('id');
        expect(perm).toHaveProperty('name');
        expect(perm).toHaveProperty('description');
      }
    });

    it('returns empty permissions array for role with none', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      // Don't add any permissions

      const response = await supertest(app)
        .get(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.role.permissions).toEqual([]);
    });

    it('can get own role', async () => {
      const { user, role } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.role.id).toBe(role.id);
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape validation', () => {
    it('role object has correct structure', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .get(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(200);

      const roleData = response.body.role;
      expect(typeof roleData.id).toBe('string');
      expect(typeof roleData.name).toBe('string');
      expect(roleData.description === null || typeof roleData.description === 'string').toBe(true);
      expect(typeof roleData.isDefault).toBe('boolean');
      expect(typeof roleData.createdAt).toBe('string');
      expect(Array.isArray(roleData.permissions)).toBe(true);
    });

    it('permission objects in array have correct structure', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      // Add a permission
      const allPerms = await getAllPermissions();
      if (allPerms.length > 0) {
        await addPermissionsToRole(role.id, [allPerms[0]!.id]);
      }

      const response = await supertest(app)
        .get(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(200);

      if (response.body.role.permissions.length > 0) {
        const perm = response.body.role.permissions[0];
        expect(typeof perm.id).toBe('string');
        expect(typeof perm.name).toBe('string');
        expect(perm.description === null || typeof perm.description === 'string').toBe(true);
      }
    });
  });
});
