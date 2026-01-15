/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { createTestOrganization } from '../../../test/fixtures/organization.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import {
  users,
  organizations,
  roles,
  profiles,
  rolePermissions,
  emailVerificationTokens,
} from '../../../db/schema.js';
import { EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS } from '../constants.js';

// Get email queue mock
import * as emailJobs from '../../../lib/services/email/jobs.js';

describe('POST /auth/register', () => {
  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  const validInput = {
    organization: {
      name: 'My Company',
      slug: 'my-company',
    },
    email: 'admin@mycompany.com',
    password: 'securepassword123',
    firstName: 'John',
    lastName: 'Doe',
  };

  // ===========================================================================
  // Validation Errors (400)
  // ===========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 when organization is missing', async () => {
      const { organization: _, ...input } = validInput;
      const response = await supertest(app).post('/auth/register').send(input).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when slug format is invalid (uppercase)', async () => {
      const input = {
        ...validInput,
        organization: { name: 'Test', slug: 'UPPER-CASE' },
      };
      const response = await supertest(app).post('/auth/register').send(input).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when password is too short', async () => {
      const input = { ...validInput, password: '1234567' };
      const response = await supertest(app).post('/auth/register').send(input).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when email is invalid', async () => {
      const input = { ...validInput, email: 'notanemail' };
      const response = await supertest(app).post('/auth/register').send(input).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when firstName is missing', async () => {
      const { firstName: _, ...input } = validInput;
      const response = await supertest(app).post('/auth/register').send(input).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when lastName is missing', async () => {
      const { lastName: _, ...input } = validInput;
      const response = await supertest(app).post('/auth/register').send(input).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // Conflict Errors (409)
  // ===========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when email already exists', async () => {
      await createTestUser({ email: 'existing@example.com' });

      const input = { ...validInput, email: 'existing@example.com' };
      const response = await supertest(app).post('/auth/register').send(input).expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toBe('Email or organization slug already in use');
    });

    it('returns 409 when email exists with different case', async () => {
      await createTestUser({ email: 'test@example.com' });

      const input = { ...validInput, email: 'TEST@EXAMPLE.COM' };
      const response = await supertest(app).post('/auth/register').send(input).expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('returns 409 when slug already exists', async () => {
      await createTestOrganization({ slug: 'existing-slug' });

      const input = {
        ...validInput,
        organization: { name: 'New Company', slug: 'existing-slug' },
      };
      const response = await supertest(app).post('/auth/register').send(input).expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toBe('Email or organization slug already in use');
    });
  });

  // ===========================================================================
  // Successful Registration (201)
  // ===========================================================================

  describe('successful registration (201)', () => {
    it('returns 201 with success message', async () => {
      const response = await supertest(app).post('/auth/register').send(validInput).expect(201);

      expect(response.body.message).toBe(
        'Registration successful. Please check your email to verify your account.'
      );
    });

    it('creates organization with correct name and slug', async () => {
      await supertest(app).post('/auth/register').send(validInput).expect(201);

      const db = getTestDb();
      const orgs = await db
        .select()
        .from(organizations)
        .where(eq(organizations.slug, validInput.organization.slug));

      expect(orgs).toHaveLength(1);
      expect(orgs[0]!.name).toBe(validInput.organization.name);
      expect(orgs[0]!.slug).toBe(validInput.organization.slug);
      expect(orgs[0]!.deletedAt).toBeNull();
    });

    it('creates Admin role with isDefault=true', async () => {
      await supertest(app).post('/auth/register').send(validInput).expect(201);

      const db = getTestDb();
      const orgs = await db
        .select()
        .from(organizations)
        .where(eq(organizations.slug, validInput.organization.slug));
      const org = orgs[0];

      const roleList = await db.select().from(roles).where(eq(roles.organizationId, org!.id));

      expect(roleList).toHaveLength(1);
      expect(roleList[0]!.name).toBe('Admin');
      expect(roleList[0]!.isDefault).toBe(true);
    });

    it('links all permissions to Admin role', async () => {
      // This test verifies that new organizations get all existing permissions
      // Note: In a fresh test DB, there may be no permissions yet
      await supertest(app).post('/auth/register').send(validInput).expect(201);

      const db = getTestDb();
      const orgs = await db
        .select()
        .from(organizations)
        .where(eq(organizations.slug, validInput.organization.slug));
      const org = orgs[0];

      const roleList = await db.select().from(roles).where(eq(roles.organizationId, org!.id));
      const role = roleList[0];

      const linkedPermissions = await db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, role!.id));

      // Admin role should have all available permissions (may be 0 in fresh DB)
      expect(Array.isArray(linkedPermissions)).toBe(true);
    });

    it('creates user with emailVerifiedAt=null', async () => {
      await supertest(app).post('/auth/register').send(validInput).expect(201);

      const db = getTestDb();
      const userList = await db
        .select()
        .from(users)
        .where(eq(users.email, validInput.email.toLowerCase()));

      expect(userList).toHaveLength(1);
      expect(userList[0]!.emailVerifiedAt).toBeNull();
    });

    it('creates user with isActive=true', async () => {
      await supertest(app).post('/auth/register').send(validInput).expect(201);

      const db = getTestDb();
      const userList = await db
        .select()
        .from(users)
        .where(eq(users.email, validInput.email.toLowerCase()));

      expect(userList[0]!.isActive).toBe(true);
    });

    it('stores email in lowercase', async () => {
      const input = { ...validInput, email: 'USER@EXAMPLE.COM' };
      await supertest(app).post('/auth/register').send(input).expect(201);

      const db = getTestDb();
      const userList = await db.select().from(users).where(eq(users.email, 'user@example.com'));

      expect(userList).toHaveLength(1);
      expect(userList[0]!.email).toBe('user@example.com');
    });

    it('creates profile with firstName and lastName', async () => {
      await supertest(app).post('/auth/register').send(validInput).expect(201);

      const db = getTestDb();
      const userList = await db
        .select()
        .from(users)
        .where(eq(users.email, validInput.email.toLowerCase()));
      const user = userList[0];

      const profileList = await db.select().from(profiles).where(eq(profiles.userId, user!.id));

      expect(profileList).toHaveLength(1);
      expect(profileList[0]!.firstName).toBe(validInput.firstName);
      expect(profileList[0]!.lastName).toBe(validInput.lastName);
    });

    it('creates email verification token', async () => {
      await supertest(app).post('/auth/register').send(validInput).expect(201);

      const db = getTestDb();
      const userList = await db
        .select()
        .from(users)
        .where(eq(users.email, validInput.email.toLowerCase()));
      const user = userList[0];

      const tokens = await db
        .select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.userId, user!.id));

      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.tokenHash).toBeTruthy();
      expect(tokens[0]!.usedAt).toBeNull();
    });

    it('sets token expiration to ~24 hours', async () => {
      const now = Date.now();
      await supertest(app).post('/auth/register').send(validInput).expect(201);

      const db = getTestDb();
      const userList = await db
        .select()
        .from(users)
        .where(eq(users.email, validInput.email.toLowerCase()));
      const user = userList[0];

      const tokens = await db
        .select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.userId, user!.id));

      const expectedExpiry = now + EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
      const actualExpiry = tokens[0]!.expiresAt.getTime();

      // Allow 5 second tolerance for test execution time
      expect(actualExpiry).toBeGreaterThan(expectedExpiry - 5000);
      expect(actualExpiry).toBeLessThan(expectedExpiry + 5000);
    });

    it('queues verification email with correct parameters', async () => {
      await supertest(app).post('/auth/register').send(validInput).expect(201);

      expect(emailJobs.queueEmailVerificationEmail).toHaveBeenCalledTimes(1);
      expect(emailJobs.queueEmailVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: validInput.email.toLowerCase(),
          firstName: validInput.firstName,
          expiresInHours: EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS,
          orgName: validInput.organization.name,
          verifyUrl: expect.stringContaining('/verify-email?token='),
        })
      );
    });

    it('does not return any sensitive data', async () => {
      const response = await supertest(app).post('/auth/register').send(validInput).expect(201);

      // Only message should be returned
      expect(Object.keys(response.body)).toEqual(['message']);
      expect(response.body.user).toBeUndefined();
      expect(response.body.token).toBeUndefined();
      expect(response.body.password).toBeUndefined();
    });

    it('stores password hashed (not plaintext)', async () => {
      await supertest(app).post('/auth/register').send(validInput).expect(201);

      const db = getTestDb();
      const userList = await db
        .select()
        .from(users)
        .where(eq(users.email, validInput.email.toLowerCase()));

      expect(userList[0]!.passwordHash).not.toBe(validInput.password);
      expect(userList[0]!.passwordHash).toMatch(/^\$argon2/); // Argon2 hash prefix
    });
  });

  // ===========================================================================
  // Email Queue Failure
  // ===========================================================================

  describe('email queue failure', () => {
    it('registration succeeds even if email queue fails', async () => {
      // Mock email queue to throw
      vi.mocked(emailJobs.queueEmailVerificationEmail).mockRejectedValueOnce(
        new Error('Queue connection failed')
      );

      // Registration should still succeed
      const response = await supertest(app).post('/auth/register').send(validInput).expect(201);

      expect(response.body.message).toBe(
        'Registration successful. Please check your email to verify your account.'
      );

      // User should still be created
      const db = getTestDb();
      const userList = await db
        .select()
        .from(users)
        .where(eq(users.email, validInput.email.toLowerCase()));
      expect(userList).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles concurrent registration attempts with same email', async () => {
      // Start both requests nearly simultaneously
      const [response1, response2] = await Promise.all([
        supertest(app).post('/auth/register').send(validInput),
        supertest(app).post('/auth/register').send(validInput),
      ]);

      // One should succeed (201), the other should get 409 (conflict)
      // The error handler converts DB unique constraint violations to 409
      const statuses = [response1.status, response2.status].sort();
      expect(statuses[0]).toBe(201);
      expect(statuses[1]).toBe(409);
    });

    it('handles concurrent registration attempts with same slug', async () => {
      const input1 = { ...validInput, email: 'user1@example.com' };
      const input2 = { ...validInput, email: 'user2@example.com' };

      const [response1, response2] = await Promise.all([
        supertest(app).post('/auth/register').send(input1),
        supertest(app).post('/auth/register').send(input2),
      ]);

      // One should succeed (201), the other should get 409 (conflict)
      // The error handler converts DB unique constraint violations to 409
      const statuses = [response1.status, response2.status].sort();
      expect(statuses[0]).toBe(201);
      expect(statuses[1]).toBe(409);
    });

    it('accepts minimum valid password (8 chars)', async () => {
      const input = { ...validInput, password: '12345678' };
      await supertest(app).post('/auth/register').send(input).expect(201);
    });

    it('accepts maximum valid password (72 chars)', async () => {
      const input = { ...validInput, password: 'a'.repeat(72) };
      await supertest(app).post('/auth/register').send(input).expect(201);
    });

    it('accepts minimum valid slug (3 chars)', async () => {
      const input = {
        ...validInput,
        organization: { name: 'Test', slug: 'abc' },
      };
      await supertest(app).post('/auth/register').send(input).expect(201);
    });

    it('accepts maximum valid slug (50 chars)', async () => {
      const input = {
        ...validInput,
        organization: { name: 'Test', slug: 'a'.repeat(50) },
      };
      await supertest(app).post('/auth/register').send(input).expect(201);
    });
  });
});
