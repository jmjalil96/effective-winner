/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestInvitation, getInvitationById } from '../../../test/helpers/invitation.js';
import { roles, users } from '../../../db/schema.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';

describe('DELETE /auth/invitations/:id', () => {
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
      const response = await supertest(app).delete(`/auth/invitations/${uuidv7()}`).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .delete(`/auth/invitations/${uuidv7()}`)
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000, // Expired
      });

      const response = await supertest(app)
        .delete(`/auth/invitations/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // ===========================================================================
  // Forbidden Errors (403)
  // ===========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without invitations:delete permission', async () => {
      const { user, organization } = await createTestUser(); // No permissions
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
      });

      const response = await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
      });

      // Deactivate account
      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });

    it('returns 403 for already accepted invitation', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        accepted: true,
      });

      const response = await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.message).toContain('accepted');
    });

    it('returns 403 for already revoked invitation', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        revoked: true,
      });

      const response = await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.message).toContain('revoked');
    });
  });

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 for non-UUID id', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete('/auth/invitations/not-a-uuid')
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
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete(`/auth/invitations/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for expired invitation', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        expiresInMs: -24 * 60 * 60 * 1000, // Expired
      });

      const response = await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for another organization invitation', async () => {
      const { user } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create another org with an invitation
      const { user: otherUser, organization: otherOrg } = await createTestUser();
      const otherRole = await createInvitableRole(otherOrg.id);
      const { invitation: otherInvitation } = await createTestInvitation({
        organizationId: otherOrg.id,
        roleId: otherRole.id,
        invitedById: otherUser.id,
      });

      const response = await supertest(app)
        .delete(`/auth/invitations/${otherInvitation.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });
  });

  // ===========================================================================
  // Success (204)
  // ===========================================================================

  describe('success (204)', () => {
    it('returns 204 No Content', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
      });

      const response = await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(204);

      expect(response.text).toBe('');
    });

    it('soft-revokes invitation (sets revokedAt)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
      });

      // Verify not revoked before
      const before = await getInvitationById(invitation.id);
      expect(before!.revokedAt).toBeNull();

      await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(204);

      // Verify revoked after
      const after = await getInvitationById(invitation.id);
      expect(after!.revokedAt).not.toBeNull();
    });

    it('invitation no longer in GET /invitations', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete', 'invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'tobedeleted@example.com',
      });

      // Verify shows in list before
      const listBefore = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);
      expect(listBefore.body.invitations).toHaveLength(1);

      // Revoke
      await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(204);

      // Verify not in list after
      const listAfter = await supertest(app)
        .get('/auth/invitations')
        .set('Cookie', cookie)
        .expect(200);
      expect(listAfter.body.invitations).toHaveLength(0);
    });

    it('revoked invitation cannot be accepted', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation, token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
      });

      // Revoke
      await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(204);

      // Try to accept
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Should',
          lastName: 'Fail',
        })
        .expect(401);

      expect(response.body.error.message).toContain('Invalid');
    });

    it('does not affect other invitations', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete', 'invitations:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation: inv1 } = await createTestInvitation({
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

      // Revoke first
      await supertest(app).delete(`/auth/invitations/${inv1.id}`).set('Cookie', cookie).expect(204);

      // Second should still exist
      const list = await supertest(app).get('/auth/invitations').set('Cookie', cookie).expect(200);
      expect(list.body.invitations).toHaveLength(1);
      expect(list.body.invitations[0].email).toBe('second@example.com');
    });
  });

  // ===========================================================================
  // Idempotency
  // ===========================================================================

  describe('idempotency', () => {
    it('revoking twice returns 403 second time', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['invitations:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);
      const invitableRole = await createInvitableRole(organization.id);

      const { invitation } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
      });

      // First revoke succeeds
      await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(204);

      // Second revoke fails (already revoked)
      const response = await supertest(app)
        .delete(`/auth/invitations/${invitation.id}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.message).toContain('revoked');
    });
  });
});
