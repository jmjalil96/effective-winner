/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase, pollUntil } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestAgent } from '../../../test/helpers/agent.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { accounts, auditLogs, users } from '../../../db/schema/index.js';
import { ACCOUNT_ERRORS } from '../constants.js';
import { AUDIT_ACTIONS } from '../../../lib/services/index.js';

describe('POST /accounts', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app)
        .post('/accounts')
        .send({ agentId: '019bc4f4-538b-7356-8c00-fd2be485f195', name: 'Test Account' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', 'sid=invalidsessionid123')
        .send({ agentId: '019bc4f4-538b-7356-8c00-fd2be485f195', name: 'Test Account' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:create'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: '019bc4f4-538b-7356-8c00-fd2be485f195', name: 'Test Account' })
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without accounts:create permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: '019bc4f4-538b-7356-8c00-fd2be485f195', name: 'Test Account' })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: '019bc4f4-538b-7356-8c00-fd2be485f195', name: 'Test Account' })
        .expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // =========================================================================
  // Validation Errors (400)
  // =========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 when required fields are missing', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when agentId is missing', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ name: 'Test Account' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'agentId' })])
      );
    });

    it('returns 400 when name is missing', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: '019bc4f4-538b-7356-8c00-fd2be485f195' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'name' })])
      );
    });

    it('returns 400 for invalid agentId UUID', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: 'not-a-uuid', name: 'Test Account' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid status', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: agent.id, name: 'Test Account', status: 'invalid_status' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Not Found Errors (404)
  // =========================================================================

  describe('not found errors (404)', () => {
    it('returns 404 when agent does not exist', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({
          agentId: '019bc4f4-538b-7356-8c00-fd2be485f195',
          name: 'Test Account',
        })
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.AGENT_NOT_FOUND);
    });

    it('returns 404 when agent is deleted', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({
        organizationId: organization.id,
        deleted: true,
      });

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: agent.id, name: 'Test Account' })
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.AGENT_NOT_FOUND);
    });

    it('returns 404 when agent belongs to different organization', async () => {
      const { user: user1 } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const { organization: org2 } = await createTestUser({
        permissionNames: ['accounts:create'],
      });

      const cookie = await loginAndGetCookie(user1.email, VALID_PASSWORD);

      // Create agent in org2
      const { agent } = await createTestAgent({ organizationId: org2.id });

      // Try to create account with agent from org2 while logged in as user1
      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: agent.id, name: 'Test Account' })
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.AGENT_NOT_FOUND);
    });
  });

  // =========================================================================
  // Success Cases (201)
  // =========================================================================

  describe('success cases (201)', () => {
    it('creates account with required fields only', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: agent.id, name: 'Test Account' })
        .expect(201);

      expect(response.body).toHaveProperty('account');
      expect(response.body.account.accountId).toBe('ACC-0001');
      expect(response.body.account.agentId).toBe(agent.id);
      expect(response.body.account.name).toBe('Test Account');
      expect(response.body.account.status).toBe('active');
    });

    it('creates account with all fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({
          agentId: agent.id,
          name: 'Premium Account',
          status: 'inactive',
        })
        .expect(201);

      expect(response.body.account).toMatchObject({
        accountId: 'ACC-0001',
        agentId: agent.id,
        name: 'Premium Account',
        status: 'inactive',
      });
    });

    it('generates sequential accountIds per organization', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });

      // Create first account
      const res1 = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: agent.id, name: 'Account 1' })
        .expect(201);

      expect(res1.body.account.accountId).toBe('ACC-0001');

      // Create second account
      const res2 = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: agent.id, name: 'Account 2' })
        .expect(201);

      expect(res2.body.account.accountId).toBe('ACC-0002');

      // Create third account
      const res3 = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: agent.id, name: 'Account 3' })
        .expect(201);

      expect(res3.body.account.accountId).toBe('ACC-0003');
    });

    it('persists account to database', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: agent.id, name: 'Persisted Account' })
        .expect(201);

      const db = getTestDb();
      const createdAccountId = String(response.body.account.id);
      const [dbAccount] = await db.select().from(accounts).where(eq(accounts.id, createdAccountId));

      expect(dbAccount?.name).toBe('Persisted Account');
      expect(dbAccount?.organizationId).toBe(organization.id);
      expect(dbAccount?.agentId).toBe(agent.id);
    });
  });

  // =========================================================================
  // Audit Logging
  // =========================================================================

  describe('audit logging', () => {
    it('creates audit log entry on successful creation', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie)
        .send({ agentId: agent.id, name: 'Audited Account' })
        .expect(201);

      const db = getTestDb();
      const createdAccountId = String(response.body.account.id);
      const log = await pollUntil(async () => {
        const [entry] = await db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityId, createdAccountId));
        return entry;
      });

      expect(log).toBeDefined();
      expect(log.action).toBe(AUDIT_ACTIONS.ACCOUNT_CREATE);
      expect(log.entityType).toBe('account');
      expect(log.actorId).toBe(user.id);
      expect(log.organizationId).toBe(organization.id);
      expect(log.metadata).toMatchObject({
        accountId: 'ACC-0001',
        name: 'Audited Account',
        agentId: agent.id,
      });
    });
  });

  // =========================================================================
  // Tenant Isolation
  // =========================================================================

  describe('tenant isolation', () => {
    it('creates accounts with separate counters per organization', async () => {
      // Create user in org1
      const { user: user1, organization: org1 } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie1 = await loginAndGetCookie(user1.email, VALID_PASSWORD);
      const { agent: agent1 } = await createTestAgent({ organizationId: org1.id });

      // Create user in org2
      const { user: user2, organization: org2 } = await createTestUser({
        permissionNames: ['accounts:create'],
      });
      const cookie2 = await loginAndGetCookie(user2.email, VALID_PASSWORD);
      const { agent: agent2 } = await createTestAgent({ organizationId: org2.id });

      // Create account in org1
      const res1 = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie1)
        .send({ agentId: agent1.id, name: 'Org1 Account' })
        .expect(201);

      expect(res1.body.account.accountId).toBe('ACC-0001');

      // Create account in org2 - should also start at ACC-0001
      const res2 = await supertest(app)
        .post('/accounts')
        .set('Cookie', cookie2)
        .send({ agentId: agent2.id, name: 'Org2 Account' })
        .expect(201);

      expect(res2.body.account.accountId).toBe('ACC-0001');
    });
  });
});
