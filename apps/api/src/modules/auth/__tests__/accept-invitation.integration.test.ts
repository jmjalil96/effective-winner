/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion, @typescript-eslint/restrict-template-expressions */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { createTestInvitation, getInvitationById } from '../../../test/helpers/invitation.js';
import { users, profiles, roles } from '../../../db/schema/index.js';

describe('POST /auth/accept-invitation', () => {
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
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 when token is missing', async () => {
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when token is empty', async () => {
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token: '',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when password is missing', async () => {
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token: 'sometoken',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when password too short (7 chars)', async () => {
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token: 'sometoken',
          password: '1234567', // 7 chars
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when password too long (73 chars)', async () => {
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token: 'sometoken',
          password: 'a'.repeat(73), // 73 chars
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when firstName is missing', async () => {
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token: 'sometoken',
          password: 'Password123!',
          lastName: 'Doe',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when firstName is empty', async () => {
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token: 'sometoken',
          password: 'Password123!',
          firstName: '',
          lastName: 'Doe',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when lastName is missing', async () => {
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token: 'sometoken',
          password: 'Password123!',
          firstName: 'John',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when lastName is empty', async () => {
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token: 'sometoken',
          password: 'Password123!',
          firstName: 'John',
          lastName: '',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // Not Found / Unauthorized Errors (401)
  // ===========================================================================

  describe('unauthorized errors (401) - timing-safe', () => {
    it('returns 401 for non-existent token', async () => {
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token: 'nonexistenttoken123456789',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(401);

      expect(response.body.error.message).toContain('Invalid');
    });

    it('returns 401 for expired invitation', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'expired@example.com',
        expiresInMs: -24 * 60 * 60 * 1000, // Expired 24 hours ago
      });

      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(401);

      expect(response.body.error.message).toContain('expired');
    });

    it('returns 401 for revoked invitation', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'revoked@example.com',
        revoked: true,
      });

      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(401);

      expect(response.body.error.message).toContain('Invalid');
    });

    it('returns 401 for already accepted invitation', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'accepted@example.com',
        accepted: true,
      });

      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(401);

      expect(response.body.error.message).toContain('Invalid');
    });
  });

  // ===========================================================================
  // Conflict Errors (409)
  // ===========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 if email was registered after invitation', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'raced@example.com',
      });

      // Register the email before accepting (race condition simulation)
      await createTestUser({ email: 'raced@example.com' });

      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(409);

      expect(response.body.error.message).toContain('already registered');
    });
  });

  // ===========================================================================
  // Success (200)
  // ===========================================================================

  describe('success (200)', () => {
    it('returns 200 with success message', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'new@example.com',
      });

      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('successfully');
    });

    it('creates user with correct email', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'newuser@example.com',
      });

      await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Jane',
          lastName: 'Smith',
        })
        .expect(200);

      // Verify user was created
      const db = getTestDb();
      const createdUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, 'newuser@example.com'));

      expect(createdUsers).toHaveLength(1);
      expect(createdUsers[0]!.email).toBe('newuser@example.com');
    });

    it('creates user with provided password (can login)', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'loginable@example.com',
      });

      await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'MyNewPassword123!',
          firstName: 'Jane',
          lastName: 'Smith',
        })
        .expect(200);

      // Should be able to login with the password
      const loginResponse = await supertest(app)
        .post('/auth/login')
        .send({ email: 'loginable@example.com', password: 'MyNewPassword123!' })
        .expect(200);

      expect(loginResponse.body.user.email).toBe('loginable@example.com');
    });

    it('creates user profile with firstName/lastName', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'profiled@example.com',
      });

      await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Jane',
          lastName: 'Smith',
        })
        .expect(200);

      // Verify profile was created
      const db = getTestDb();
      const createdUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, 'profiled@example.com'));
      const userId = createdUsers[0]!.id;

      const createdProfiles = await db.select().from(profiles).where(eq(profiles.userId, userId));

      expect(createdProfiles).toHaveLength(1);
      expect(createdProfiles[0]!.firstName).toBe('Jane');
      expect(createdProfiles[0]!.lastName).toBe('Smith');
    });

    it('user belongs to inviter organization', async () => {
      const { user, organization } = await createTestUser({ organizationName: 'Inviter Org' });
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'orguser@example.com',
      });

      await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Org',
          lastName: 'User',
        })
        .expect(200);

      // Verify user belongs to same org
      const db = getTestDb();
      const createdUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, 'orguser@example.com'));

      expect(createdUsers[0]!.organizationId).toBe(organization.id);
    });

    it('user has invited role', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id, 'Staff');

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'roleuser@example.com',
      });

      await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Role',
          lastName: 'User',
        })
        .expect(200);

      // Verify user has the invited role
      const db = getTestDb();
      const createdUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, 'roleuser@example.com'));

      expect(createdUsers[0]!.roleId).toBe(invitableRole.id);
    });

    it('user is active', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'activeuser@example.com',
      });

      await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Active',
          lastName: 'User',
        })
        .expect(200);

      // Verify user is active
      const db = getTestDb();
      const createdUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, 'activeuser@example.com'));

      expect(createdUsers[0]!.isActive).toBe(true);
    });

    it('user email is auto-verified', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'verified@example.com',
      });

      await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Verified',
          lastName: 'User',
        })
        .expect(200);

      // Verify email is marked as verified
      const db = getTestDb();
      const createdUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, 'verified@example.com'));

      expect(createdUsers[0]!.emailVerifiedAt).not.toBeNull();
    });

    it('marks invitation as accepted', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token, invitation } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'accepted@example.com',
      });

      await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Accepted',
          lastName: 'User',
        })
        .expect(200);

      // Verify invitation is marked as accepted
      const updatedInvitation = await getInvitationById(invitation.id);
      expect(updatedInvitation!.acceptedAt).not.toBeNull();
    });

    it('same token cannot be used twice', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'oncetrick@example.com',
      });

      // First accept succeeds
      await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Once',
          lastName: 'Trick',
        })
        .expect(200);

      // Second accept fails
      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Once',
          lastName: 'Trick',
        })
        .expect(401);

      expect(response.body.error.message).toContain('Invalid');
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================

  describe('response shape validation', () => {
    it('has correct structure', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'shape@example.com',
      });

      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'Shape',
          lastName: 'Test',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.message).toBe('string');
    });

    it('does not include sensitive data', async () => {
      const { user, organization } = await createTestUser();
      const invitableRole = await createInvitableRole(organization.id);

      const { token } = await createTestInvitation({
        organizationId: organization.id,
        roleId: invitableRole.id,
        invitedById: user.id,
        email: 'nosecrets@example.com',
      });

      const response = await supertest(app)
        .post('/auth/accept-invitation')
        .send({
          token,
          password: 'Password123!',
          firstName: 'No',
          lastName: 'Secrets',
        })
        .expect(200);

      expect(response.body).not.toHaveProperty('user');
      expect(response.body).not.toHaveProperty('token');
      expect(response.body).not.toHaveProperty('password');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });
  });
});
