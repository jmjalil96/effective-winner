/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestRole, getRoleById, softDeleteRole } from '../../../test/helpers/role.js';
import { users } from '../../../db/schema/index.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('POST /rbac/roles', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app)
        .post('/rbac/roles')
        .send({ name: 'NewRole' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', 'sid=invalidsessionid123')
        .send({ name: 'NewRole' })
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
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'NewRole' })
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // ===========================================================================
  // Forbidden Errors (403)
  // ===========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without roles:write permission', async () => {
      const { user } = await createTestUser(); // No permissions
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'NewRole' })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Deactivate account
      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'NewRole' })
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 when name is missing', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when name is empty string', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: '' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when name exceeds 100 chars', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'a'.repeat(101) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when description exceeds 500 chars', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'ValidName', description: 'a'.repeat(501) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // Conflict Errors (409)
  // ===========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when role name exists in org', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create a role with the same name
      await createTestRole({
        organizationId: organization.id,
        name: 'ExistingRole',
      });

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'ExistingRole' })
        .expect(409);

      expect(response.body.error.message).toContain('already exists');
    });

    it('allows same name in different orgs', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create a role with same name in different org
      const { organization: otherOrg } = await createTestUser();
      await createTestRole({
        organizationId: otherOrg.id,
        name: 'SharedName',
      });

      // Should succeed - same name in different org is allowed
      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'SharedName' })
        .expect(201);

      expect(response.body.role.name).toBe('SharedName');
    });

    it('allows name of soft-deleted role', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create and soft-delete a role
      const { role: deletedRole } = await createTestRole({
        organizationId: organization.id,
        name: 'ReusableName',
      });
      await softDeleteRole(deletedRole.id);

      // Should succeed - name is freed up after soft-delete
      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'ReusableName' })
        .expect(201);

      expect(response.body.role.name).toBe('ReusableName');
    });
  });

  // ===========================================================================
  // Success (201)
  // ===========================================================================

  describe('success (201)', () => {
    it('returns 201 with role', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'NewRole' })
        .expect(201);

      expect(response.body).toHaveProperty('role');
      expect(response.body.role.name).toBe('NewRole');
    });

    it('role has correct fields', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'NewRole', description: 'A new role' })
        .expect(201);

      const role = response.body.role;
      expect(role).toHaveProperty('id');
      expect(role).toHaveProperty('name');
      expect(role).toHaveProperty('description');
      expect(role).toHaveProperty('isDefault');
      expect(role).toHaveProperty('createdAt');
    });

    it('role is created in database', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'DatabaseRole' })
        .expect(201);

      // Verify in database
      const dbRole = await getRoleById(response.body.role.id);
      expect(dbRole).not.toBeNull();
      expect(dbRole!.name).toBe('DatabaseRole');
    });

    it('isDefault is false for new roles', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'NonDefaultRole' })
        .expect(201);

      expect(response.body.role.isDefault).toBe(false);
    });

    it('description is optional', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'NoDescRole' })
        .expect(201);

      expect(response.body.role.description).toBeNull();
    });

    it('accepts description', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'DescRole', description: 'Role with description' })
        .expect(201);

      expect(response.body.role.description).toBe('Role with description');
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape validation', () => {
    it('role object has correct structure', async () => {
      const { user } = await createTestUser({
        permissionNames: ['roles:write'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/rbac/roles')
        .set('Cookie', cookie)
        .send({ name: 'StructureRole' })
        .expect(201);

      const role = response.body.role;
      expect(typeof role.id).toBe('string');
      expect(typeof role.name).toBe('string');
      expect(role.description === null || typeof role.description === 'string').toBe(true);
      expect(typeof role.isDefault).toBe('boolean');
      expect(typeof role.createdAt).toBe('string');
    });
  });
});
