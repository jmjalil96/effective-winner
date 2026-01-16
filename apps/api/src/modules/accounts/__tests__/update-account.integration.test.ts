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
import { auditLogs, users } from '../../../db/schema/index.js';
import { ACCOUNT_ERRORS } from '../constants.js';
import { AUDIT_ACTIONS } from '../../../lib/services/index.js';

describe('PATCH /accounts/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app)
        .patch(`/accounts/${uuidv7()}`)
        .send({ name: 'New Name' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .patch(`/accounts/${uuidv7()}`)
        .set('Cookie', 'sid=invalidsessionid123')
        .send({ name: 'New Name' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app)
        .patch(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without accounts:update permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .patch(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
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
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/accounts/not-a-uuid')
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid status', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid agentId UUID', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({ agentId: 'not-a-uuid' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Not Found Errors (404)
  // =========================================================================

  describe('not found errors (404)', () => {
    it('returns 404 when account does not exist', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
    });

    it('returns 404 when account is soft-deleted', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        deleted: true,
      });

      const response = await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
    });

    it('returns 404 when account belongs to different organization', async () => {
      const { user: user1 } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const { organization: org2 } = await createTestUser();
      const { agent: agent2 } = await createTestAgent({ organizationId: org2.id });
      const { account: account2 } = await createTestAccount({
        organizationId: org2.id,
        agentId: agent2.id,
      });

      const cookie = await loginAndGetCookie(user1.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch(`/accounts/${account2.id}`)
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
    });

    it('returns 404 when new agentId does not exist', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({ agentId: uuidv7() })
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.AGENT_NOT_FOUND);
    });

    it('returns 404 when new agentId belongs to different organization', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const { organization: org2 } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      // Create agent in user's org
      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      // Create agent in different org
      const { agent: otherOrgAgent } = await createTestAgent({ organizationId: org2.id });

      const response = await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({ agentId: otherOrgAgent.id })
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.AGENT_NOT_FOUND);
    });
  });

  // =========================================================================
  // Success Cases (200)
  // =========================================================================

  describe('success cases (200)', () => {
    it('updates name', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Old Name',
      });

      const response = await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(200);

      expect(response.body.account.name).toBe('New Name');
    });

    it('updates status', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        status: 'active',
      });

      const response = await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({ status: 'inactive' })
        .expect(200);

      expect(response.body.account.status).toBe('inactive');
    });

    it('updates agentId (reassignment)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent: agent1 } = await createTestAgent({ organizationId: organization.id });
      const { agent: agent2 } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent1.id,
      });

      const response = await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({ agentId: agent2.id })
        .expect(200);

      expect(response.body.account.agentId).toBe(agent2.id);
    });

    it('returns existing account for empty body', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Original Name',
      });

      const response = await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({})
        .expect(200);

      expect(response.body.account.name).toBe('Original Name');
    });

    it('updates timestamp', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const response = await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({ name: 'Updated Name' })
        .expect(200);

      const originalUpdatedAt = new Date(account.updatedAt).getTime();
      const newUpdatedAt = new Date(response.body.account.updatedAt as string).getTime();
      expect(newUpdatedAt).toBeGreaterThan(originalUpdatedAt);
    });
  });

  // =========================================================================
  // Audit Logging
  // =========================================================================

  describe('audit logging', () => {
    it('creates audit log entry with before/after changes', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Old Name',
      });

      await supertest(app)
        .patch(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .send({ name: 'New Name' })
        .expect(200);

      const db = getTestDb();
      const log = await pollUntil(async () => {
        const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, account.id));
        return entry;
      });

      expect(log).toBeDefined();
      expect(log.action).toBe(AUDIT_ACTIONS.ACCOUNT_UPDATE);
      expect(log.entityType).toBe('account');
      expect(log.actorId).toBe(user.id);
      expect(log.organizationId).toBe(organization.id);
      expect(log.changes).toMatchObject({
        before: { name: 'Old Name' },
        after: { name: 'New Name' },
      });
    });
  });
});
