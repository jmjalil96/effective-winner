/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
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
  getRoleById,
  assignUserToRole,
} from '../../../test/helpers/role.js';
import { users } from '../../../db/schema/index.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('DELETE /rbac/roles/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).delete(`/rbac/roles/${uuidv7()}`).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .delete(`/rbac/roles/${uuidv7()}`)
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:delete'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000, // Expired
      });

      const response = await supertest(app)
        .delete(`/rbac/roles/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // ===========================================================================
  // Forbidden Errors (403)
  // ===========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without roles:delete permission', async () => {
      const { user, organization } = await createTestUser(); // No permissions
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .delete(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      // Deactivate account
      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .delete(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });

    it('returns 403 when deleting default role', async () => {
      const { user, role } = await createTestUser({
        permissionNames: ['roles:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // The user's role is the default Admin role
      const response = await supertest(app)
        .delete(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.message).toContain('default');
    });
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 for non-UUID id', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete('/rbac/roles/not-a-uuid')
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
        permissionNames: ['roles:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete(`/rbac/roles/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for already deleted role', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });
      await softDeleteRole(role.id);

      const response = await supertest(app)
        .delete(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for another org role', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create role in different org
      const { organization: otherOrg } = await createTestUser();
      const { role: otherRole } = await createTestRole({ organizationId: otherOrg.id });

      const response = await supertest(app)
        .delete(`/rbac/roles/${otherRole.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });
  });

  // ===========================================================================
  // Conflict Errors (409)
  // ===========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when role has assigned users', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create a role and assign a user to it (user must be in same org)
      const { role } = await createTestRole({ organizationId: organization.id });
      const { user: otherUser } = await createTestUser({ organizationId: organization.id });
      await assignUserToRole(otherUser.id, role.id);

      const response = await supertest(app)
        .delete(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(409);

      expect(response.body.error.message).toContain('assigned user');
    });
  });

  // ===========================================================================
  // Success (204)
  // ===========================================================================

  describe('success (204)', () => {
    it('returns 204 No Content', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .delete(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .expect(204);

      expect(response.text).toBe('');
    });

    it('soft-deletes role (sets deletedAt)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      // Verify not deleted before
      const before = await getRoleById(role.id);
      expect(before?.deletedAt).toBeNull();

      await supertest(app).delete(`/rbac/roles/${role.id}`).set('Cookie', cookie).expect(204);

      // Verify deleted after
      const after = await getRoleById(role.id);
      expect(after?.deletedAt).not.toBeNull();
    });

    it('role no longer in GET /roles list', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:delete', 'roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({
        organizationId: organization.id,
        name: 'ToBeDeleted',
      });

      // Verify in list before
      const listBefore = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);
      expect(listBefore.body.roles.some((r: { id: string }) => r.id === role.id)).toBe(true);

      // Delete
      await supertest(app).delete(`/rbac/roles/${role.id}`).set('Cookie', cookie).expect(204);

      // Verify not in list after
      const listAfter = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);
      expect(listAfter.body.roles.some((r: { id: string }) => r.id === role.id)).toBe(false);
    });

    it('does not affect other roles', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:delete', 'roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role: role1 } = await createTestRole({
        organizationId: organization.id,
        name: 'Role1',
      });
      const { role: role2 } = await createTestRole({
        organizationId: organization.id,
        name: 'Role2',
      });

      // Delete role1
      await supertest(app).delete(`/rbac/roles/${role1.id}`).set('Cookie', cookie).expect(204);

      // role2 should still exist
      const response = await supertest(app)
        .get(`/rbac/roles/${role2.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.role.name).toBe('Role2');
    });
  });
});
