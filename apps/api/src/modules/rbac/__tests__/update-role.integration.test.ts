/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestRole, softDeleteRole, getRoleById } from '../../../test/helpers/role.js';
import { users } from '../../../db/schema/index.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('PATCH /rbac/roles/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app)
        .patch(`/rbac/roles/${uuidv7()}`)
        .send({ name: 'Updated' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .patch(`/rbac/roles/${uuidv7()}`)
        .set('Cookie', 'sid=invalidsessionid123')
        .send({ name: 'Updated' })
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
        .patch(`/rbac/roles/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ name: 'Updated' })
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
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'Updated' })
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
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'Updated' })
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });

    it('returns 403 when renaming default role', async () => {
      const { user, role } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // The user's role is the default Admin role
      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'RenamedAdmin' })
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
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/rbac/roles/not-a-uuid')
        .set('Cookie', cookie)
        .send({ name: 'Updated' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when name is empty string', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: '' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when name exceeds 100 chars', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'a'.repeat(101) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when description exceeds 500 chars', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({ organizationId: organization.id });

      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ description: 'a'.repeat(501) })
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
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch(`/rbac/roles/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ name: 'Updated' })
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
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'Updated' })
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
        .patch(`/rbac/roles/${otherRole.id}`)
        .set('Cookie', cookie)
        .send({ name: 'Updated' })
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });
  });

  // ===========================================================================
  // Conflict Errors (409)
  // ===========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when new name exists', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create two roles
      const { role: role1 } = await createTestRole({
        organizationId: organization.id,
        name: 'Role1',
      });
      await createTestRole({
        organizationId: organization.id,
        name: 'Role2',
      });

      // Try to rename role1 to Role2
      const response = await supertest(app)
        .patch(`/rbac/roles/${role1.id}`)
        .set('Cookie', cookie)
        .send({ name: 'Role2' })
        .expect(409);

      expect(response.body.error.message).toContain('already exists');
    });

    it('allows updating to same name (no-op)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({
        organizationId: organization.id,
        name: 'SameName',
      });

      // Update to same name should succeed
      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'SameName' })
        .expect(200);

      expect(response.body.role.name).toBe('SameName');
    });
  });

  // ===========================================================================
  // Success (200)
  // ===========================================================================

  describe('success (200)', () => {
    it('returns 200 with updated role', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({
        organizationId: organization.id,
        name: 'OriginalName',
      });

      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'UpdatedName' })
        .expect(200);

      expect(response.body).toHaveProperty('role');
      expect(response.body.role.name).toBe('UpdatedName');
    });

    it('updates name only', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({
        organizationId: organization.id,
        name: 'Original',
        description: 'Original description',
      });

      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'NewName' })
        .expect(200);

      expect(response.body.role.name).toBe('NewName');
      expect(response.body.role.description).toBe('Original description');
    });

    it('updates description only', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({
        organizationId: organization.id,
        name: 'KeepName',
        description: 'Old description',
      });

      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ description: 'New description' })
        .expect(200);

      expect(response.body.role.name).toBe('KeepName');
      expect(response.body.role.description).toBe('New description');
    });

    it('sets description to null', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({
        organizationId: organization.id,
        name: 'HasDesc',
        description: 'Has description',
      });

      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ description: null })
        .expect(200);

      expect(response.body.role.description).toBeNull();
    });

    it('updates both name and description', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({
        organizationId: organization.id,
        name: 'OldName',
        description: 'Old desc',
      });

      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'NewName', description: 'New desc' })
        .expect(200);

      expect(response.body.role.name).toBe('NewName');
      expect(response.body.role.description).toBe('New desc');
    });

    it('allows empty body (no changes)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({
        organizationId: organization.id,
        name: 'Unchanged',
        description: 'Still here',
      });

      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({})
        .expect(200);

      expect(response.body.role.name).toBe('Unchanged');
      expect(response.body.role.description).toBe('Still here');
    });

    it('persists changes to database', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { role } = await createTestRole({
        organizationId: organization.id,
        name: 'BeforeUpdate',
      });

      await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'AfterUpdate' })
        .expect(200);

      // Verify in database
      const dbRole = await getRoleById(role.id);
      expect(dbRole?.name).toBe('AfterUpdate');
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

      const response = await supertest(app)
        .patch(`/rbac/roles/${role.id}`)
        .set('Cookie', cookie)
        .send({ name: 'StructureTest' })
        .expect(200);

      const roleData = response.body.role;
      expect(typeof roleData.id).toBe('string');
      expect(typeof roleData.name).toBe('string');
      expect(roleData.description === null || typeof roleData.description === 'string').toBe(true);
      expect(typeof roleData.isDefault).toBe('boolean');
      expect(typeof roleData.createdAt).toBe('string');
    });
  });
});
