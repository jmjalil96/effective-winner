/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase, pollUntil } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestAgent, createTestAccount, createTestClient } from '../../../test/helpers/agent.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { clients, auditLogs, users } from '../../../db/schema/index.js';
import { CLIENT_ERRORS } from '../constants.js';
import { AUDIT_ACTIONS } from '../../../lib/services/index.js';

describe('PATCH /clients/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app)
        .patch(`/clients/${uuidv7()}`)
        .send({ firstName: 'Updated' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .patch(`/clients/${uuidv7()}`)
        .set('Cookie', 'sid=invalidsessionid123')
        .send({ firstName: 'Updated' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app)
        .patch(`/clients/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without clients:update permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch(`/clients/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .patch(`/clients/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // =========================================================================
  // Validation Errors (400)
  // =========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 for non-UUID id', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/clients/not-a-uuid')
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid email', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid status', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ status: 'unknown' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid govIdType for individual client', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ govIdType: 'ruc_empresa' })
        .expect(400);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.INVALID_GOV_ID_TYPE);
    });

    it('returns 400 for invalid govIdType for business client', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ govIdType: 'cedula' })
        .expect(400);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.INVALID_GOV_ID_TYPE);
    });

    it('returns 400 when changing individual to business without companyName', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ clientType: 'business' })
        .expect(400);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.TYPE_CHANGE_MISSING_FIELDS);
    });

    it('returns 400 when changing business to individual without firstName', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ clientType: 'individual', lastName: 'Perez' })
        .expect(400);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.TYPE_CHANGE_MISSING_FIELDS);
    });

    it('returns 400 when changing business to individual without lastName', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ clientType: 'individual', firstName: 'Juan' })
        .expect(400);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.TYPE_CHANGE_MISSING_FIELDS);
    });
  });

  // =========================================================================
  // Not Found Errors (404)
  // =========================================================================

  describe('not found errors (404)', () => {
    it('returns 404 for missing client', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch(`/clients/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(404);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.CLIENT_NOT_FOUND);
    });

    it('returns 404 for other organization client', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { organization: otherOrg } = await createTestUser();
      const { agent } = await createTestAgent({ organizationId: otherOrg.id });
      const { account } = await createTestAccount({
        organizationId: otherOrg.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: otherOrg.id,
        accountId: account.id,
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(404);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.CLIENT_NOT_FOUND);
    });

    it('returns 404 for soft-deleted client', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        deleted: true,
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(404);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.CLIENT_NOT_FOUND);
    });
  });

  // =========================================================================
  // Conflict Errors (409)
  // =========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when email already exists (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      // Create first client with email
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        email: 'taken@example.com',
      });

      // Create second client to update
      const { client: clientToUpdate } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        email: 'original@example.com',
      });

      const response = await supertest(app)
        .patch(`/clients/${clientToUpdate.id}`)
        .set('Cookie', cookie)
        .send({ email: 'TAKEN@EXAMPLE.COM' })
        .expect(409);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.EMAIL_EXISTS);
    });

    it('returns 409 when govIdNumber already exists', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      // Create first client with govIdNumber
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        govIdType: 'cedula',
        govIdNumber: '001-1234567-8',
      });

      // Create second client to update
      const { client: clientToUpdate } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
      });

      const response = await supertest(app)
        .patch(`/clients/${clientToUpdate.id}`)
        .set('Cookie', cookie)
        .send({ govIdType: 'cedula', govIdNumber: '001-1234567-8' })
        .expect(409);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.GOV_ID_EXISTS);
    });

    it('allows updating to same email (no change)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        email: 'myemail@example.com',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ email: 'MYEMAIL@EXAMPLE.COM' })
        .expect(200);

      expect(response.body.client.email).toBe('myemail@example.com');
    });

    it('allows updating to same govIdNumber (no change)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        govIdType: 'cedula',
        govIdNumber: '001-1234567-8',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ govIdNumber: '001-1234567-8' })
        .expect(200);

      expect(response.body.client.govIdNumber).toBe('001-1234567-8');
    });
  });

  // =========================================================================
  // Success (200)
  // =========================================================================

  describe('success (200)', () => {
    it('updates individual client fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Original',
        lastName: 'Name',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({
          firstName: 'Updated',
          lastName: 'Client',
          email: 'updated@example.com',
        })
        .expect(200);

      expect(response.body.client.firstName).toBe('Updated');
      expect(response.body.client.lastName).toBe('Client');
      expect(response.body.client.name).toBe('Updated Client');
      expect(response.body.client.email).toBe('updated@example.com');
    });

    it('updates business client fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
        companyName: 'Original Corp',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({
          companyName: 'Updated Corp',
          businessDescription: 'Software company',
        })
        .expect(200);

      expect(response.body.client.companyName).toBe('Updated Corp');
      expect(response.body.client.name).toBe('Updated Corp');
      expect(response.body.client.businessDescription).toBe('Software company');
    });

    it('changes individual to business with required fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Juan',
        lastName: 'Perez',
        sex: 'male',
        dob: '1990-01-15',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({
          clientType: 'business',
          companyName: 'New Business Corp',
          businessDescription: 'Tech company',
        })
        .expect(200);

      expect(response.body.client.clientType).toBe('business');
      expect(response.body.client.companyName).toBe('New Business Corp');
      expect(response.body.client.name).toBe('New Business Corp');
      expect(response.body.client.businessDescription).toBe('Tech company');
      // Individual fields should be cleared
      expect(response.body.client.firstName).toBeNull();
      expect(response.body.client.lastName).toBeNull();
      expect(response.body.client.sex).toBeNull();
      expect(response.body.client.dob).toBeNull();
    });

    it('changes business to individual with required fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
        companyName: 'Old Corp',
        businessDescription: 'Old description',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({
          clientType: 'individual',
          firstName: 'Maria',
          lastName: 'Lopez',
          sex: 'female',
          dob: '1985-06-20',
        })
        .expect(200);

      expect(response.body.client.clientType).toBe('individual');
      expect(response.body.client.firstName).toBe('Maria');
      expect(response.body.client.lastName).toBe('Lopez');
      expect(response.body.client.name).toBe('Maria Lopez');
      expect(response.body.client.sex).toBe('female');
      expect(response.body.client.dob).toBe('1985-06-20');
      // Business fields should be cleared
      expect(response.body.client.companyName).toBeNull();
      expect(response.body.client.businessDescription).toBeNull();
    });

    it('clears existing govIdType when changing type and govIdType becomes invalid', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Juan',
        lastName: 'Perez',
        govIdType: 'cedula',
        govIdNumber: '001-1234567-8',
      });

      // Change to business with new valid govIdType
      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({
          clientType: 'business',
          companyName: 'New Corp',
          govIdType: 'ruc_empresa',
          govIdNumber: '123456789',
        })
        .expect(200);

      expect(response.body.client.clientType).toBe('business');
      expect(response.body.client.govIdType).toBe('ruc_empresa');
      expect(response.body.client.govIdNumber).toBe('123456789');
    });

    it('returns existing client for empty body (no-op)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Juan',
        lastName: 'Perez',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({})
        .expect(200);

      expect(response.body.client.id).toBe(client.id);
      expect(response.body.client.firstName).toBe('Juan');
      expect(response.body.client.lastName).toBe('Perez');
    });

    it('recomputes name when firstName changes', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Juan',
        lastName: 'Perez',
        name: 'Juan Perez',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Carlos' })
        .expect(200);

      expect(response.body.client.firstName).toBe('Carlos');
      expect(response.body.client.lastName).toBe('Perez');
      expect(response.body.client.name).toBe('Carlos Perez');
    });

    it('recomputes name when lastName changes', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Juan',
        lastName: 'Perez',
        name: 'Juan Perez',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ lastName: 'Rodriguez' })
        .expect(200);

      expect(response.body.client.firstName).toBe('Juan');
      expect(response.body.client.lastName).toBe('Rodriguez');
      expect(response.body.client.name).toBe('Juan Rodriguez');
    });

    it('recomputes name when companyName changes', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
        companyName: 'Old Corp',
        name: 'Old Corp',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ companyName: 'New Corp' })
        .expect(200);

      expect(response.body.client.companyName).toBe('New Corp');
      expect(response.body.client.name).toBe('New Corp');
    });

    it('normalizes name with trimming and space collapsing', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Juan',
        lastName: 'Perez',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ firstName: '  Maria  ', lastName: '  Lopez  ' })
        .expect(200);

      expect(response.body.client.firstName).toBe('Maria');
      expect(response.body.client.lastName).toBe('Lopez');
      expect(response.body.client.name).toBe('Maria Lopez');
    });

    it('updates status', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        status: 'active',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ status: 'inactive' })
        .expect(200);

      expect(response.body.client.status).toBe('inactive');
    });

    it('clears nullable fields with null', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        email: 'test@example.com',
        phone: '+18091234567',
        govIdType: 'cedula',
        govIdNumber: '001-1234567-8',
      });

      const response = await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({
          email: null,
          phone: null,
          govIdType: null,
          govIdNumber: null,
        })
        .expect(200);

      expect(response.body.client.email).toBeNull();
      expect(response.body.client.phone).toBeNull();
      expect(response.body.client.govIdType).toBeNull();
      expect(response.body.client.govIdNumber).toBeNull();
    });

    it('persists changes in database', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Original',
        lastName: 'Name',
      });

      await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated', lastName: 'Person' })
        .expect(200);

      const db = getTestDb();
      const [updatedClient] = await db.select().from(clients).where(eq(clients.id, client.id));

      expect(updatedClient?.firstName).toBe('Updated');
      expect(updatedClient?.lastName).toBe('Person');
      expect(updatedClient?.name).toBe('Updated Person');
    });

    it('writes audit log entry with before/after changes', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });
      const { client } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Juan',
        lastName: 'Perez',
        name: 'Juan Perez',
        email: 'juan@example.com',
        status: 'active',
      });

      await supertest(app)
        .patch(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .send({
          firstName: 'Carlos',
          email: 'carlos@example.com',
          status: 'inactive',
        })
        .expect(200);

      const db = getTestDb();
      const log = await pollUntil(async () => {
        const [row] = await db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityId, client.id));
        return row;
      });

      expect(log.action).toBe(AUDIT_ACTIONS.CLIENT_UPDATE);
      expect(log.entityType).toBe('client');
      expect(log.actorId).toBe(user.id);
      expect(log.organizationId).toBe(organization.id);
      expect(log.changes).toMatchObject({
        before: {
          clientType: 'individual',
          name: 'Juan Perez',
          email: 'juan@example.com',
          status: 'active',
        },
        after: {
          clientType: 'individual',
          name: 'Carlos Perez',
          email: 'carlos@example.com',
          status: 'inactive',
        },
      });
    });
  });
});
