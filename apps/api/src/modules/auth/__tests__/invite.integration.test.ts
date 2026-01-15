/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestInvitation } from '../../../test/helpers/invitation.js';
import { roles, users } from '../../../db/schema/index.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { INVITATION_EXPIRY_HOURS } from '../constants.js';

// Get email queue mock
import * as emailJobs from '../../../lib/services/email/jobs.js';

describe('POST /auth/invite', () => {
  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  // Helper to create a non-admin role in the same org
  const createInvitableRole = async (organizationId: string, roleName?: string) => {
    const db = getTestDb();
    const uniqueName =
      roleName ?? `Invitee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [role] = await db
      .insert(roles)
      .values({
        id: uuidv7(),
        organizationId,
        name: uniqueName,
        description: 'Invitable role',
        isDefault: false,
      })
      .returning();
    if (!role) throw new Error('Failed to create role');
    return role;
  };

  // ===========================================================================
  // Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app)
        .post('/auth/invite')
        .send({ email: 'new@example.com', roleId: uuidv7() })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', 'sid=invalidsessionid123')
        .send({ email: 'new@example.com', roleId: uuidv7() })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000, // Expired
      });

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: uuidv7() })
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // ===========================================================================
  // Forbidden Errors (403)
  // ===========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without invitations:create permission', async () => {
      const { user, organization } = await createTestUser(); // No permissions
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id);

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: invitableRole.id })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id);

      // Deactivate account
      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: invitableRole.id })
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });

    it('returns 403 when inviting to admin/default role', async () => {
      const { user, role } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // role.isDefault is true (admin role)
      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: role.id })
        .expect(403);

      expect(response.body.error.message).toBe('Cannot invite to admin role');
    });
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 when email is missing', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ roleId: uuidv7() })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when email is invalid', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'notanemail', roleId: uuidv7() })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when roleId is missing', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'valid@example.com' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when roleId is not UUID', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'valid@example.com', roleId: 'not-a-uuid' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // Not Found Errors (404)
  // ===========================================================================

  describe('not found errors (404)', () => {
    it('returns 404 when roleId does not exist', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: uuidv7() }) // Random UUID
        .expect(404);

      expect(response.body.error.message).toBe('Role not found');
    });

    it('returns 404 when roleId belongs to different organization', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create another org with a role
      const { role: otherRole } = await createTestUser();

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: otherRole.id })
        .expect(404);

      expect(response.body.error.message).toBe('Role not found');
    });
  });

  // ===========================================================================
  // Conflict Errors (409)
  // ===========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when email already registered', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id);

      // Create another user with the target email
      const { user: existingUser } = await createTestUser({ email: 'existing@example.com' });

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: existingUser.email, roleId: invitableRole.id })
        .expect(409);

      expect(response.body.error.message).toContain('already registered');
    });

    it('returns 409 when pending invitation exists', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id);

      // Create pending invitation
      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'pending@example.com',
      });

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'pending@example.com', roleId: invitableRole.id })
        .expect(409);

      expect(response.body.error.message).toContain('pending');
    });
  });

  // ===========================================================================
  // Success (201)
  // ===========================================================================

  describe('success (201)', () => {
    it('returns 201 with invitation', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id, 'Staff');

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: invitableRole.id })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('role');
      expect(response.body).toHaveProperty('expiresAt');
    });

    it('invitation has correct fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id, 'Editor');

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: invitableRole.id })
        .expect(201);

      expect(response.body.email).toBe('new@example.com');
      expect(response.body.role.id).toBe(invitableRole.id);
      expect(response.body.role.name).toBe('Editor');
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.expiresAt).toBe('string');
    });

    it('invitation expires in 48 hours', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id);

      const beforeRequest = Date.now();

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: invitableRole.id })
        .expect(201);

      const expiresAt = new Date(response.body.expiresAt).getTime();
      const expectedExpiry = beforeRequest + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000;

      // Allow 5 second tolerance
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });

    it('handles email case-insensitively', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id);

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'TEST@EXAMPLE.COM', roleId: invitableRole.id })
        .expect(201);

      // Email should be stored lowercase
      expect(response.body.email).toBe('test@example.com');
    });

    it('queues invitation email', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
        firstName: 'John',
        organizationName: 'Test Corp',
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id, 'Staff');

      await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: invitableRole.id })
        .expect(201);

      expect(emailJobs.queueInvitationEmail).toHaveBeenCalledTimes(1);
      expect(emailJobs.queueInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'new@example.com',
          organizationName: 'Test Corp',
          roleName: 'Staff',
          inviteUrl: expect.stringContaining('/accept-invitation?token='),
        })
      );
    });

    it('allows re-inviting after revoked invitation', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id);

      // Create and revoke invitation
      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'revoked@example.com',
        revoked: true,
      });

      // Should be able to invite again
      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'revoked@example.com', roleId: invitableRole.id })
        .expect(201);

      expect(response.body.email).toBe('revoked@example.com');
    });

    it('allows re-inviting after expired invitation', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id);

      // Create expired invitation
      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'expired@example.com',
        expiresInMs: -24 * 60 * 60 * 1000, // Expired 24 hours ago
      });

      // Should be able to invite again
      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'expired@example.com', roleId: invitableRole.id })
        .expect(201);

      expect(response.body.email).toBe('expired@example.com');
    });

    it('does not include token in response', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id);

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: invitableRole.id })
        .expect(201);

      expect(response.body).not.toHaveProperty('token');
      expect(response.body).not.toHaveProperty('tokenHash');
      expect(JSON.stringify(response.body)).not.toContain('token');
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape validation', () => {
    it('has correct structure', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const invitableRole = await createInvitableRole(organization.id, 'Viewer');

      const response = await supertest(app)
        .post('/auth/invite')
        .set('Cookie', cookie)
        .send({ email: 'new@example.com', roleId: invitableRole.id })
        .expect(201);

      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.email).toBe('string');
      expect(typeof response.body.role).toBe('object');
      expect(typeof response.body.role.id).toBe('string');
      expect(typeof response.body.role.name).toBe('string');
      expect(typeof response.body.expiresAt).toBe('string');
    });
  });
});
