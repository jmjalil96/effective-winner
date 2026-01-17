/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestAgent, createTestAccount, createTestClient } from '../../../test/helpers/agent.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { clients, users } from '../../../db/schema/index.js';

describe('GET /clients', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).get('/clients').expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .get('/clients')
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app).get('/clients').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without clients:read permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/clients').set('Cookie', cookie).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app).get('/clients').set('Cookie', cookie).expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // =========================================================================
  // Validation Errors (400)
  // =========================================================================

  describe('validation errors (400)', () => {
    it('rejects invalid clientType', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/clients?clientType=invalid')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid status', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/clients?status=invalid')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects page less than 1', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/clients?page=0')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects limit greater than 100', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/clients?limit=101')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid sortBy', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/clients?sortBy=invalid')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid sortOrder', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/clients?sortOrder=invalid')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Success (200)
  // =========================================================================

  describe('success (200)', () => {
    it('returns clients with pagination', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({ organizationId: organization.id, accountId: account.id });
      await createTestClient({ organizationId: organization.id, accountId: account.id });

      const response = await supertest(app)
        .get('/clients?limit=1&page=1')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(1);
    });

    it('returns empty array with total 0 when no clients', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/clients').set('Cookie', cookie).expect(200);

      expect(response.body.clients).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('filters by clientType (individual)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Juan',
        lastName: 'Perez',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
        companyName: 'Acme Corp',
      });

      const response = await supertest(app)
        .get('/clients?clientType=individual')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].clientType).toBe('individual');
    });

    it('filters by clientType (business)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
        companyName: 'Acme Corp',
      });

      const response = await supertest(app)
        .get('/clients?clientType=business')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].clientType).toBe('business');
    });

    it('filters by status (active)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        status: 'active',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        status: 'inactive',
      });

      const response = await supertest(app)
        .get('/clients?status=active')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].status).toBe('active');
    });

    it('filters by status (inactive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        status: 'active',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        status: 'inactive',
      });

      const response = await supertest(app)
        .get('/clients?status=inactive')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].status).toBe('inactive');
    });

    it('filters by accountName (case-insensitive partial match)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account: account1 } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Premium Account',
      });
      const { account: account2 } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Basic Account',
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account1.id,
        firstName: 'Client',
        lastName: 'One',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account2.id,
        firstName: 'Client',
        lastName: 'Two',
      });

      const response = await supertest(app)
        .get('/clients?accountName=PREMIUM')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].name).toBe('Client One');
    });

    it('filters by firstName (case-insensitive partial match)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Carlos',
        lastName: 'Garcia',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Maria',
        lastName: 'Lopez',
      });

      const response = await supertest(app)
        .get('/clients?firstName=carl')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].firstName).toBe('Carlos');
    });

    it('filters by lastName (case-insensitive partial match)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Carlos',
        lastName: 'Fernandez',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Maria',
        lastName: 'Lopez',
      });

      const response = await supertest(app)
        .get('/clients?lastName=FERN')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].lastName).toBe('Fernandez');
    });

    it('filters by companyName (case-insensitive partial match)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
        companyName: 'Acme Corporation',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
        companyName: 'Globex Industries',
      });

      const response = await supertest(app)
        .get('/clients?companyName=acme')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].companyName).toBe('Acme Corporation');
    });

    it('searches by clientId (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientId: 'CLT-1234',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientId: 'CLT-5678',
      });

      const response = await supertest(app)
        .get('/clients?search=clt-1234')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].clientId).toBe('CLT-1234');
    });

    it('searches by name (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'John Doe',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'Jane Smith',
      });

      const response = await supertest(app)
        .get('/clients?search=JOHN')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].name).toBe('John Doe');
    });

    it('searches by email (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        email: 'carlos@company.com',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        email: 'maria@company.com',
      });

      const response = await supertest(app)
        .get('/clients?search=CARLOS@')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].email).toBe('carlos@company.com');
    });

    it('searches by phone', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        phone: '+18091234567',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        phone: '+18097654321',
      });

      const response = await supertest(app)
        .get('/clients?search=1234567')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].phone).toBe('+18091234567');
    });

    it('searches by govIdNumber', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        govIdNumber: '001-1234567-8',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        govIdNumber: '002-9876543-2',
      });

      const response = await supertest(app)
        .get('/clients?search=1234567')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].govIdNumber).toBe('001-1234567-8');
    });

    it('combines multiple filters', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        status: 'active',
        firstName: 'Juan',
        lastName: 'Target',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        status: 'inactive',
        firstName: 'Carlos',
        lastName: 'Other',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'business',
        status: 'active',
        companyName: 'Corp',
      });

      const response = await supertest(app)
        .get('/clients?clientType=individual&status=active')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].firstName).toBe('Juan');
    });

    it('sorts by name ascending', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'Zebra Corp',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'Alpha Inc',
      });

      const response = await supertest(app)
        .get('/clients?sortBy=name&sortOrder=asc')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients[0].name).toBe('Alpha Inc');
      expect(response.body.clients[1].name).toBe('Zebra Corp');
    });

    it('sorts by name descending', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'Alpha Inc',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'Zebra Corp',
      });

      const response = await supertest(app)
        .get('/clients?sortBy=name&sortOrder=desc')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients[0].name).toBe('Zebra Corp');
      expect(response.body.clients[1].name).toBe('Alpha Inc');
    });

    it('sorts by clientId ascending', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientId: 'CLT-0002',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientId: 'CLT-0001',
      });

      const response = await supertest(app)
        .get('/clients?sortBy=clientId&sortOrder=asc')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients[0].clientId).toBe('CLT-0001');
      expect(response.body.clients[1].clientId).toBe('CLT-0002');
    });

    it('defaults to sortBy=createdAt sortOrder=desc', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const { client: older } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'Older Client',
      });
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      const { client: newer } = await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'Newer Client',
      });

      const response = await supertest(app).get('/clients').set('Cookie', cookie).expect(200);

      expect(response.body.clients[0].id).toBe(newer.id);
      expect(response.body.clients[1].id).toBe(older.id);
    });

    it('paginates correctly with offset', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      // Create 3 clients with specific names for predictable sorting
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'Alpha',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'Beta',
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        name: 'Gamma',
      });

      const response = await supertest(app)
        .get('/clients?sortBy=name&sortOrder=asc&page=2&limit=1')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.clients.length).toBe(1);
      expect(response.body.clients[0].name).toBe('Beta');
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.total).toBe(3);
    });

    it('excludes soft-deleted clients', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        deleted: true,
      });
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
      });

      const response = await supertest(app).get('/clients').set('Cookie', cookie).expect(200);

      expect(response.body.clients.length).toBe(1);
    });

    it('returns organization clients only (tenant isolation)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent: ownAgent } = await createTestAgent({ organizationId: organization.id });
      const { account: ownAccount } = await createTestAccount({
        organizationId: organization.id,
        agentId: ownAgent.id,
      });
      const { client: ownClient } = await createTestClient({
        organizationId: organization.id,
        accountId: ownAccount.id,
      });

      // Create client in different organization
      const { organization: otherOrg } = await createTestUser();
      const { agent: otherAgent } = await createTestAgent({ organizationId: otherOrg.id });
      const { account: otherAccount } = await createTestAccount({
        organizationId: otherOrg.id,
        agentId: otherAgent.id,
      });
      await createTestClient({
        organizationId: otherOrg.id,
        accountId: otherAccount.id,
      });

      const response = await supertest(app).get('/clients').set('Cookie', cookie).expect(200);

      const clientsList = response.body.clients as Array<{ id: string }>;
      expect(clientsList).toHaveLength(1);
      expect(clientsList[0]?.id).toBe(ownClient.id);
    });

    it('returns correct response fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
        clientType: 'individual',
        firstName: 'Juan',
        lastName: 'Perez',
        email: 'juan@test.com',
        phone: '+18091234567',
        govIdType: 'cedula',
        govIdNumber: '001-1234567-8',
        sex: 'male',
        dob: '1990-05-15',
      });

      const response = await supertest(app).get('/clients').set('Cookie', cookie).expect(200);

      const clientsList = response.body.clients as Array<Record<string, unknown>>;
      const client = clientsList[0];
      expect(client).toHaveProperty('id');
      expect(client).toHaveProperty('clientId');
      expect(client).toHaveProperty('account');
      expect(client).toHaveProperty('clientType');
      expect(client).toHaveProperty('name');
      expect(client).toHaveProperty('firstName');
      expect(client).toHaveProperty('lastName');
      expect(client).toHaveProperty('companyName');
      expect(client).toHaveProperty('govIdType');
      expect(client).toHaveProperty('govIdNumber');
      expect(client).toHaveProperty('phone');
      expect(client).toHaveProperty('email');
      expect(client).toHaveProperty('sex');
      expect(client).toHaveProperty('dob');
      expect(client).toHaveProperty('businessDescription');
      expect(client).toHaveProperty('status');
      expect(client).toHaveProperty('createdAt');
      expect(client).toHaveProperty('updatedAt');
    });

    it('removes clients from list after deletion', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:read'],
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

      const db = getTestDb();
      await db.update(clients).set({ deletedAt: new Date() }).where(eq(clients.id, client.id));

      const response = await supertest(app).get('/clients').set('Cookie', cookie).expect(200);

      const clientsList = response.body.clients as Array<{ id: string }>;
      expect(clientsList.find((item) => item.id === client.id)).toBeFalsy();
    });
  });
});
