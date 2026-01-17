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
import { createTestAgent, createTestAccount } from '../../../test/helpers/agent.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { clients, auditLogs, users } from '../../../db/schema/index.js';
import { CLIENT_ERRORS } from '../constants.js';
import { AUDIT_ACTIONS } from '../../../lib/services/index.js';

const BASE_INDIVIDUAL_PAYLOAD = {
  clientType: 'individual' as const,
  firstName: 'Juan',
  lastName: 'Perez',
  email: 'juan@example.com',
  phone: '+18091234567',
  dob: '1990-05-15',
};

const BASE_BUSINESS_PAYLOAD = {
  clientType: 'business' as const,
  companyName: 'Acme Corp',
  email: 'contact@acme.com',
  phone: '+18097654321',
};

describe('POST /clients', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app)
        .post('/clients')
        .send({ ...BASE_INDIVIDUAL_PAYLOAD, accountId: uuidv7() })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', 'sid=invalidsessionid123')
        .send({ ...BASE_INDIVIDUAL_PAYLOAD, accountId: uuidv7() })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({ ...BASE_INDIVIDUAL_PAYLOAD, accountId: uuidv7() })
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without clients:create permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({ ...BASE_INDIVIDUAL_PAYLOAD, accountId: uuidv7() })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({ ...BASE_INDIVIDUAL_PAYLOAD, accountId: uuidv7() })
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // =========================================================================
  // Validation Errors (400)
  // =========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 when firstName is missing for individual', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          clientType: 'individual',
          accountId: account.id,
          lastName: 'Perez',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when lastName is missing for individual', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          clientType: 'individual',
          accountId: account.id,
          firstName: 'Juan',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when companyName is missing for business', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          clientType: 'business',
          accountId: account.id,
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid accountId UUID', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({ ...BASE_INDIVIDUAL_PAYLOAD, accountId: 'not-a-uuid' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when rnc govIdType is used for individual', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account.id,
          govIdType: 'rnc',
          govIdNumber: '123456789',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when cedula govIdType is used for business', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_BUSINESS_PAYLOAD,
          accountId: account.id,
          govIdType: 'cedula',
          govIdNumber: '001-1234567-8',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid email format', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account.id,
          email: 'not-an-email',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid dob format', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account.id,
          dob: '15/05/1990',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Not Found Errors (404)
  // =========================================================================

  describe('not found errors (404)', () => {
    it('returns 404 when accountId does not exist', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({ ...BASE_INDIVIDUAL_PAYLOAD, accountId: uuidv7() })
        .expect(404);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.ACCOUNT_NOT_FOUND);
    });

    it('returns 404 when accountId belongs to different organization', async () => {
      const { user: user1 } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const { organization: org2 } = await createTestUser();
      const cookie = await loginAndGetCookie(user1.email, VALID_PASSWORD);

      const { agent: agent2 } = await createTestAgent({ organizationId: org2.id });
      const { account: account2 } = await createTestAccount({
        organizationId: org2.id,
        agentId: agent2.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({ ...BASE_INDIVIDUAL_PAYLOAD, accountId: account2.id })
        .expect(404);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.ACCOUNT_NOT_FOUND);
    });
  });

  // =========================================================================
  // Conflict Errors (409)
  // =========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when email already exists (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      // Create first client with lowercase email
      await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account.id,
          email: 'test@example.com',
        })
        .expect(201);

      // Try to create another with uppercase email
      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account.id,
          firstName: 'Another',
          lastName: 'Client',
          email: 'TEST@EXAMPLE.COM',
        })
        .expect(409);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.EMAIL_EXISTS);
    });

    it('returns 409 when govIdNumber already exists', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      // Create first client with govIdNumber
      await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account.id,
          govIdType: 'cedula',
          govIdNumber: '001-1234567-8',
        })
        .expect(201);

      // Try to create another with same govIdNumber
      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account.id,
          firstName: 'Another',
          lastName: 'Client',
          email: 'another@example.com',
          govIdType: 'cedula',
          govIdNumber: '001-1234567-8',
        })
        .expect(409);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.GOV_ID_EXISTS);
    });

    it('allows same email in different organizations', async () => {
      const { user: user1, organization: org1 } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const { user: user2, organization: org2 } = await createTestUser({
        permissionNames: ['clients:create'],
      });

      const cookie1 = await loginAndGetCookie(user1.email, VALID_PASSWORD);
      const cookie2 = await loginAndGetCookie(user2.email, VALID_PASSWORD);

      const { agent: agent1 } = await createTestAgent({ organizationId: org1.id });
      const { account: account1 } = await createTestAccount({
        organizationId: org1.id,
        agentId: agent1.id,
      });

      const { agent: agent2 } = await createTestAgent({ organizationId: org2.id });
      const { account: account2 } = await createTestAccount({
        organizationId: org2.id,
        agentId: agent2.id,
      });

      // Create client in org1
      await supertest(app)
        .post('/clients')
        .set('Cookie', cookie1)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account1.id,
          email: 'shared@example.com',
        })
        .expect(201);

      // Create client with same email in org2 - should succeed
      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie2)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account2.id,
          email: 'shared@example.com',
        })
        .expect(201);

      expect(response.body.client.email).toBe('shared@example.com');
    });

    it('allows same govIdNumber in different organizations', async () => {
      const { user: user1, organization: org1 } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const { user: user2, organization: org2 } = await createTestUser({
        permissionNames: ['clients:create'],
      });

      const cookie1 = await loginAndGetCookie(user1.email, VALID_PASSWORD);
      const cookie2 = await loginAndGetCookie(user2.email, VALID_PASSWORD);

      const { agent: agent1 } = await createTestAgent({ organizationId: org1.id });
      const { account: account1 } = await createTestAccount({
        organizationId: org1.id,
        agentId: agent1.id,
      });

      const { agent: agent2 } = await createTestAgent({ organizationId: org2.id });
      const { account: account2 } = await createTestAccount({
        organizationId: org2.id,
        agentId: agent2.id,
      });

      // Create client in org1
      await supertest(app)
        .post('/clients')
        .set('Cookie', cookie1)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account1.id,
          govIdType: 'cedula',
          govIdNumber: '001-9999999-9',
        })
        .expect(201);

      // Create client with same govIdNumber in org2 - should succeed
      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie2)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account2.id,
          govIdType: 'cedula',
          govIdNumber: '001-9999999-9',
        })
        .expect(201);

      expect(response.body.client.govIdNumber).toBe('001-9999999-9');
    });
  });

  // =========================================================================
  // Success (201)
  // =========================================================================

  describe('success (201)', () => {
    it('creates individual client with all fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account.id,
          govIdType: 'cedula',
          govIdNumber: '001-1234567-8',
          sex: 'male',
        })
        .expect(201);

      expect(response.body).toHaveProperty('client');
      expect(response.body.client.clientType).toBe('individual');
      expect(response.body.client.firstName).toBe('Juan');
      expect(response.body.client.lastName).toBe('Perez');
      expect(response.body.client.name).toBe('Juan Perez');
      expect(response.body.client.email).toBe('juan@example.com');
      expect(response.body.client.govIdType).toBe('cedula');
      expect(response.body.client.sex).toBe('male');
      expect(response.body.client.status).toBe('active');
      expect(response.body.client.clientId).toMatch(/^CLT-\d{4}$/);
    });

    it('creates individual client with minimal fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          clientType: 'individual',
          accountId: account.id,
          firstName: 'Maria',
          lastName: 'Lopez',
        })
        .expect(201);

      expect(response.body.client.firstName).toBe('Maria');
      expect(response.body.client.lastName).toBe('Lopez');
      expect(response.body.client.name).toBe('Maria Lopez');
      expect(response.body.client.email).toBeNull();
      expect(response.body.client.govIdType).toBeNull();
    });

    it('creates business client with all fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_BUSINESS_PAYLOAD,
          accountId: account.id,
          govIdType: 'ruc_empresa',
          govIdNumber: '123456789',
          businessDescription: 'Software development company',
        })
        .expect(201);

      expect(response.body.client.clientType).toBe('business');
      expect(response.body.client.companyName).toBe('Acme Corp');
      expect(response.body.client.name).toBe('Acme Corp');
      expect(response.body.client.firstName).toBeNull();
      expect(response.body.client.lastName).toBeNull();
      expect(response.body.client.govIdType).toBe('ruc_empresa');
      expect(response.body.client.businessDescription).toBe('Software development company');
    });

    it('creates business client with minimal fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          clientType: 'business',
          accountId: account.id,
          companyName: 'Simple Corp',
        })
        .expect(201);

      expect(response.body.client.companyName).toBe('Simple Corp');
      expect(response.body.client.name).toBe('Simple Corp');
      expect(response.body.client.email).toBeNull();
    });

    it('creates individual client with pasaporte govIdType', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account.id,
          govIdType: 'pasaporte',
          govIdNumber: 'AB1234567',
        })
        .expect(201);

      expect(response.body.client.govIdType).toBe('pasaporte');
    });

    it('creates individual client with ruc_individual govIdType', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          ...BASE_INDIVIDUAL_PAYLOAD,
          accountId: account.id,
          govIdType: 'ruc_individual',
          govIdNumber: '12345678901',
        })
        .expect(201);

      expect(response.body.client.govIdType).toBe('ruc_individual');
    });

    it('persists client in database', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({ ...BASE_INDIVIDUAL_PAYLOAD, accountId: account.id })
        .expect(201);

      const db = getTestDb();
      const createdClientId = String(response.body.client.id);
      const [client] = await db.select().from(clients).where(eq(clients.id, createdClientId));

      expect(client).toBeDefined();
      expect(client?.firstName).toBe('Juan');
      expect(client?.lastName).toBe('Perez');
      expect(client?.name).toBe('Juan Perez');
    });

    it('normalizes display name by trimming and collapsing spaces', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({
          clientType: 'individual',
          accountId: account.id,
          firstName: '  Juan  ',
          lastName: '  Perez  ',
        })
        .expect(201);

      expect(response.body.client.firstName).toBe('Juan');
      expect(response.body.client.lastName).toBe('Perez');
      expect(response.body.client.name).toBe('Juan Perez');
    });

    it('writes audit log entry', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .post('/clients')
        .set('Cookie', cookie)
        .send({ ...BASE_INDIVIDUAL_PAYLOAD, accountId: account.id })
        .expect(201);

      const db = getTestDb();
      const createdClientId = String(response.body.client.id);
      const log = await pollUntil(async () => {
        const [row] = await db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityId, createdClientId));
        return row;
      });

      expect(log.action).toBe(AUDIT_ACTIONS.CLIENT_CREATE);
      expect(log.entityType).toBe('client');
      expect(log.actorId).toBe(user.id);
      expect(log.organizationId).toBe(organization.id);
      expect(log.metadata).toMatchObject({
        clientId: String(response.body.client.clientId),
        clientType: 'individual',
        name: 'Juan Perez',
        accountId: account.id,
      });
    });
  });
});
