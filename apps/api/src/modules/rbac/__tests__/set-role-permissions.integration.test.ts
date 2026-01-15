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
  getAllPermissions,
  addPermissionsToRole,
  getRolePermissions,
} from '../../../test/helpers/role.js';
import { users } from '../../../db/schema/index.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('PUT /rbac/roles/:id/permissions', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app)
        .put(`/rbac/roles/${uuidv7()}/permissions`)
        .send({ permissionIds: [] })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .put(`/rbac/roles/${uuidv7()}/permissions`)
        .set('Cookie', 'sid=invalidsessionid123')
        .send({ permissionIds: [] })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000, // Expired
      });

      const response = await supertest(app)
        .put(`/rbac/roles/${uuidv7()}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [] })
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // ===========================================================================
  // Forbidden Errors (403)
  // ===========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without roles:write permission', async () => {
      const { user, organization } = await createTestUser(); // No permissions
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [] })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      // Deactivate account
      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [] })
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });

    it('returns 403 when modifying default role permissions', async () => {
      const { user, role } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // The user's role is the default Admin role
      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [] })
        .expect(403);

      expect(response.body.error.message).toContain('default');
    });
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 for non-UUID role id', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .put('/rbac/roles/not-a-uuid/permissions')
        .set('Cookie', cookie)
        .send({ permissionIds: [] })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when permissionIds is not array', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: 'not-an-array' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when permissionIds contains non-UUID', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: ['not-a-uuid'] })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when permissionIds has duplicates', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      const allPerms = await getAllPermissions();
      const permId = allPerms[0]?.id ?? uuidv7();

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [permId, permId] })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when permissionIds contains invalid id', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [uuidv7()] }) // Random UUID that doesn't exist
        .expect(400);

      expect(response.body.error.message).toContain('invalid');
    });
  });

  // ===========================================================================
  // Not Found Errors (404)
  // ===========================================================================

  describe('not found errors (404)', () => {
    it('returns 404 for non-existent role', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .put(`/rbac/roles/${uuidv7()}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [] })
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for soft-deleted role', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      await softDeleteRole(role.id);

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [] })
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for another org role', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create role in different org
      const { organization: otherOrg } = await createTestUser();
      const { role: otherRole } = await createTestRole({ organizationId: otherOrg.id });

      const response = await supertest(app)
        .put(`/rbac/roles/${otherRole.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [] })
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });
  });

  // ===========================================================================
  // Success (200)
  // ===========================================================================

  describe('success (200)', () => {
    it('returns 200 with role and new permissions', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      const allPerms = await getAllPermissions();
      expect(allPerms.length).toBeGreaterThanOrEqual(1);

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [allPerms[0]!.id] })
        .expect(200);

      expect(response.body).toHaveProperty('role');
      expect(response.body.role).toHaveProperty('permissions');
      expect(Array.isArray(response.body.role.permissions)).toBe(true);
    });

    it('replaces all permissions (not additive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      const allPerms = await getAllPermissions();
      expect(allPerms.length).toBeGreaterThanOrEqual(2);

      // Add first permission
      await addPermissionsToRole(role.id, [allPerms[0]!.id]);

      // Set to second permission only (should replace, not add)
      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [allPerms[1]!.id] })
        .expect(200);

      // Should only have the second permission, not both
      expect(response.body.role.permissions.length).toBe(1);
      expect(response.body.role.permissions[0].id).toBe(allPerms[1]!.id);
    });

    it('sets empty permissions array', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      const allPerms = await getAllPermissions();
      expect(allPerms.length).toBeGreaterThanOrEqual(2);

      // Add permissions first
      await addPermissionsToRole(role.id, [allPerms[0]!.id, allPerms[1]!.id]);

      // Clear all permissions
      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [] })
        .expect(200);

      expect(response.body.role.permissions).toEqual([]);
    });

    it('adds multiple permissions', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      const allPerms = await getAllPermissions();
      expect(allPerms.length).toBeGreaterThanOrEqual(3);
      const permIds = allPerms.slice(0, 3).map((p) => p.id);

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: permIds })
        .expect(200);

      expect(response.body.role.permissions.length).toBe(3);
    });

    it('permissions returned in response', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      const allPerms = await getAllPermissions();
      expect(allPerms.length).toBeGreaterThanOrEqual(1);

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [allPerms[0]!.id] })
        .expect(200);

      const perm = response.body.role.permissions[0];
      expect(perm).toHaveProperty('id');
      expect(perm).toHaveProperty('name');
      expect(perm).toHaveProperty('description');
    });

    it('role permissions updated in database', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      const allPerms = await getAllPermissions();
      expect(allPerms.length).toBeGreaterThanOrEqual(2);
      const targetPermIds = [allPerms[0]!.id, allPerms[1]!.id];

      await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: targetPermIds })
        .expect(200);

      // Verify in database
      const dbPerms = await getRolePermissions(role.id);
      expect(dbPerms.length).toBe(2);
      expect(dbPerms.map((p) => p.id).sort()).toEqual(targetPermIds.sort());
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape validation', () => {
    it('role object has correct structure', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      const allPerms = await getAllPermissions();
      expect(allPerms.length).toBeGreaterThanOrEqual(1);

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [allPerms[0]!.id] })
        .expect(200);

      const roleData = response.body.role;
      expect(typeof roleData.id).toBe('string');
      expect(typeof roleData.name).toBe('string');
      expect(roleData.description === null || typeof roleData.description === 'string').toBe(true);
      expect(typeof roleData.isDefault).toBe('boolean');
      expect(typeof roleData.createdAt).toBe('string');
      expect(Array.isArray(roleData.permissions)).toBe(true);
    });

    it('permission objects have correct structure', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      const allPerms = await getAllPermissions();
      expect(allPerms.length).toBeGreaterThanOrEqual(1);

      const response = await supertest(app)
        .put(`/rbac/roles/${role.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissionIds: [allPerms[0]!.id] })
        .expect(200);

      const perm = response.body.role.permissions[0];
      expect(typeof perm.id).toBe('string');
      expect(typeof perm.name).toBe('string');
      expect(perm.description === null || typeof perm.description === 'string').toBe(true);
    });
  });
});
