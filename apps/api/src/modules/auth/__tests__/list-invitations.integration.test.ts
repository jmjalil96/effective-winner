/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/restrict-template-expressions */
import { describe, it, expect, beforeEach } from 'vitest';
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

describe('GET /auth/invitations', () => {
  beforeEach(async () => {
    await cleanupDatabase();
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
      const response = await supertest(app).get('/auth/invitations').expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:read'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000, // Expired
      });

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // ===========================================================================
  // Forbidden Errors (403)
  // ===========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without invitations:read permission', async () => {
      const { user } = await createTestUser(); // No permissions
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Deactivate account
      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // ===========================================================================
  // Success (200)
  // ===========================================================================

  describe('success (200)', () => {
    it('returns 200 with invitations array', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body).toHaveProperty('invitations');
      expect(Array.isArray(response.body.invitations)).toBe(true);
    });

    it('returns empty array when no invitations', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.invitations).toEqual([]);
    });

    it('returns pending invitations only', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      // Create a pending invitation
      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'pending@example.com',
      });

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.invitations).toHaveLength(1);
      expect(response.body.invitations[0].email).toBe('pending@example.com');
    });

    it('excludes accepted invitations', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      // Create an accepted invitation
      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'accepted@example.com',
        accepted: true,
      });

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.invitations).toHaveLength(0);
    });

    it('excludes revoked invitations', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      // Create a revoked invitation
      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'revoked@example.com',
        revoked: true,
      });

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.invitations).toHaveLength(0);
    });

    it('excludes expired invitations', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      // Create an expired invitation
      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'expired@example.com',
        expiresInMs: -24 * 60 * 60 * 1000, // Expired 24 hours ago
      });

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.invitations).toHaveLength(0);
    });

    it('only returns own organization invitations', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      // Create invitation in current org
      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'ownorg@example.com',
      });

      // Create another org with its own invitation
      const { user: otherUser, organization: otherOrg } = await createTestUser();
      const otherRole = await createInvitableRole(otherOrg.id);
      await createTestInvitation({
        organizationId: otherOrg.id,
        roleId: otherRole.id,
        invitedById: otherUser.id,
        email: 'otherorg@example.com',
      });

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      // Should only see own org's invitation
      expect(response.body.invitations).toHaveLength(1);
      expect(response.body.invitations[0].email).toBe('ownorg@example.com');
    });

    it('invitation has correct fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:read'],
        firstName: 'Inviter',
        lastName: 'Person',
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id, 'Staff');

      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'fields@example.com',
      });

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      const invitation = response.body.invitations[0];
      expect(invitation).toHaveProperty('id');
      expect(invitation).toHaveProperty('email');
      expect(invitation).toHaveProperty('role');
      expect(invitation).toHaveProperty('invitedBy');
      expect(invitation).toHaveProperty('expiresAt');
      expect(invitation).toHaveProperty('createdAt');

      expect(invitation.email).toBe('fields@example.com');
      expect(invitation.role.id).toBe(invitableRole.id);
      expect(invitation.role.name).toBe('Staff');
      expect(invitation.invitedBy.id).toBe(user.id);
      expect(invitation.invitedBy.firstName).toBe('Inviter');
      expect(invitation.invitedBy.lastName).toBe('Person');
    });

    it('does not include token or tokenHash', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id, 'Staff');

      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'notokens@example.com',
      });

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      const invitation = response.body.invitations[0];
      expect(invitation).not.toHaveProperty('token');
      expect(invitation).not.toHaveProperty('tokenHash');
      // Verify no tokenHash field anywhere in the response
      expect(invitation).not.toHaveProperty('tokenHash');
    });

    it('returns multiple pending invitations', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'first@example.com',
      });
      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'second@example.com',
      });
      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'third@example.com',
      });

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.invitations).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape validation', () => {
    it('invitations array has correct structure', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'structure@example.com',
      });

      const response = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);

      const invitation = response.body.invitations[0];
      expect(typeof invitation.id).toBe('string');
      expect(typeof invitation.email).toBe('string');
      expect(typeof invitation.role).toBe('object');
      expect(typeof invitation.role.id).toBe('string');
      expect(typeof invitation.role.name).toBe('string');
      expect(typeof invitation.invitedBy).toBe('object');
      expect(typeof invitation.invitedBy.id).toBe('string');
      expect(typeof invitation.invitedBy.firstName).toBe('string');
      expect(typeof invitation.invitedBy.lastName).toBe('string');
      expect(typeof invitation.expiresAt).toBe('string');
      expect(typeof invitation.createdAt).toBe('string');
    });
  });
});
