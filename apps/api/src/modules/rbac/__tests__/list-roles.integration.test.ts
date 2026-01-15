/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-template-expressions */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestRole, softDeleteRole } from '../../../test/helpers/role.js';
import { users } from '../../../db/schema.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('GET /rbac/roles', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).get('/rbac/roles').expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .get('/rbac/roles')
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

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(401);

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

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(403);

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

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // ===========================================================================
  // Success (200)
  // ===========================================================================

  describe('success (200)', () => {
    it('returns 200 with roles array', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);

      expect(response.body).toHaveProperty('roles');
      expect(Array.isArray(response.body.roles)).toBe(true);
    });

    it('returns organization roles only', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create additional role in this org
      await createTestRole({
        organizationId: organization.id,
        name: 'CustomRole',
      });

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);

      // Should have at least 2 roles (Admin + CustomRole)
      expect(response.body.roles.length).toBeGreaterThanOrEqual(2);
      const roleNames = response.body.roles.map((r: { name: string }) => r.name);
      expect(roleNames).toContain('CustomRole');
    });

    it('excludes other organization roles', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create another org with a role
      const { organization: otherOrg } = await createTestUser();
      await createTestRole({
        organizationId: otherOrg.id,
        name: 'OtherOrgRole',
      });

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);

      const roleNames = response.body.roles.map((r: { name: string }) => r.name);
      expect(roleNames).not.toContain('OtherOrgRole');
    });

    it('excludes soft-deleted roles', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create and then soft-delete a role
      const { role: deletedRole } = await createTestRole({
        organizationId: organization.id,
        name: 'DeletedRole',
      });
      await softDeleteRole(deletedRole.id);

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);

      const roleNames = response.body.roles.map((r: { name: string }) => r.name);
      expect(roleNames).not.toContain('DeletedRole');
    });

    it('role has correct fields', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);

      expect(response.body.roles.length).toBeGreaterThan(0);
      const role = response.body.roles[0];
      expect(role).toHaveProperty('id');
      expect(role).toHaveProperty('name');
      expect(role).toHaveProperty('description');
      expect(role).toHaveProperty('isDefault');
      expect(role).toHaveProperty('createdAt');
      expect(role).toHaveProperty('userCount');
    });

    it('includes userCount for each role', async () => {
      const { user, role } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);

      // Find the role the user is on
      const userRole = response.body.roles.find((r: { id: string }) => r.id === role.id);
      expect(userRole).toBeDefined();
      expect(userRole.userCount).toBeGreaterThanOrEqual(1);
    });

    it('userCount excludes deleted users', async () => {
      const { user, organization, role } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create another user in SAME organization and soft-delete them
      const db = getTestDb();
      await db.insert(users).values({
        id: uuidv7(),
        organizationId: organization.id,
        roleId: role.id,
        email: `deleted-${Date.now()}@example.com`,
        passwordHash: null,
        isActive: true,
        deletedAt: new Date(), // Soft-deleted
      });

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);

      // The deleted user should not be counted
      const userRole = response.body.roles.find((r: { id: string }) => r.id === role.id);
      expect(userRole.userCount).toBe(1); // Only the active user
    });

    it('returns default role with isDefault flag', async () => {
      const { user, role } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);

      const defaultRole = response.body.roles.find((r: { isDefault: boolean }) => r.isDefault);
      expect(defaultRole).toBeDefined();
      expect(defaultRole.id).toBe(role.id); // The user's role should be the default
      expect(defaultRole.isDefault).toBe(true);
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape validation', () => {
    it('role object has correct structure', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);

      const role = response.body.roles[0];
      expect(typeof role.id).toBe('string');
      expect(typeof role.name).toBe('string');
      expect(role.description === null || typeof role.description === 'string').toBe(true);
      expect(typeof role.isDefault).toBe('boolean');
      expect(typeof role.createdAt).toBe('string');
      expect(typeof role.userCount).toBe('number');
    });

    it('createdAt is ISO string', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/rbac/roles').set('Cookie', cookie).expect(200);

      const role = response.body.roles[0];
      // Should be parseable as a date
      const date = new Date(role.createdAt);
      expect(date.toISOString()).toBe(role.createdAt);
    });
  });
});
