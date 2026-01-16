/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestAgent, createTestAccount } from '../../../test/helpers/agent.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { users } from '../../../db/schema/index.js';

describe('GET /accounts', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).get('/accounts').expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .get('/accounts')
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app).get('/accounts').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without accounts:read permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/accounts').set('Cookie', cookie).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app).get('/accounts').set('Cookie', cookie).expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // =========================================================================
  // Validation Errors (400)
  // =========================================================================

  describe('validation errors (400)', () => {
    it('returns 400 for invalid status value', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/accounts?status=invalid_status')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid page value', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/accounts?page=0')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid limit value', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/accounts?limit=101')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Success Cases (200)
  // =========================================================================

  describe('success cases (200)', () => {
    it('returns empty list when no accounts', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/accounts').set('Cookie', cookie).expect(200);

      expect(response.body.accounts).toEqual([]);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 0,
      });
    });

    it('returns accounts with pagination metadata', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      await createTestAccount({ organizationId: organization.id, agentId: agent.id });
      await createTestAccount({ organizationId: organization.id, agentId: agent.id });

      const response = await supertest(app).get('/accounts').set('Cookie', cookie).expect(200);

      expect(response.body.accounts).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 2,
      });
    });

    it('excludes soft-deleted accounts', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        deleted: true,
      });
      await createTestAccount({ organizationId: organization.id, agentId: agent.id });

      const response = await supertest(app).get('/accounts').set('Cookie', cookie).expect(200);

      expect(response.body.accounts).toHaveLength(1);
    });
  });

  // =========================================================================
  // Filtering
  // =========================================================================

  describe('filtering', () => {
    it('filters by status', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        status: 'active',
      });
      await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        status: 'inactive',
      });

      const response = await supertest(app)
        .get('/accounts?status=inactive')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.accounts).toHaveLength(1);
      expect(response.body.accounts[0].status).toBe('inactive');
    });

    it('filters by agentName (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent: agent1 } = await createTestAgent({
        organizationId: organization.id,
        firstName: 'Carlos',
        lastName: 'Garcia',
      });
      const { agent: agent2 } = await createTestAgent({
        organizationId: organization.id,
        firstName: 'Maria',
        lastName: 'Lopez',
      });
      await createTestAccount({
        organizationId: organization.id,
        agentId: agent1.id,
        name: 'Carlos Account',
      });
      await createTestAccount({
        organizationId: organization.id,
        agentId: agent2.id,
        name: 'Maria Account',
      });

      const response = await supertest(app)
        .get('/accounts?agentName=carlos')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.accounts).toHaveLength(1);
      expect(response.body.accounts[0].name).toBe('Carlos Account');
    });

    it('searches by name (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Premium Account',
      });
      await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Basic Account',
      });

      const response = await supertest(app)
        .get('/accounts?search=premium')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.accounts).toHaveLength(1);
      expect(response.body.accounts[0].name).toBe('Premium Account');
    });
  });

  // =========================================================================
  // Pagination
  // =========================================================================

  describe('pagination', () => {
    it('respects limit parameter', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      await createTestAccount({ organizationId: organization.id, agentId: agent.id });
      await createTestAccount({ organizationId: organization.id, agentId: agent.id });
      await createTestAccount({ organizationId: organization.id, agentId: agent.id });

      const response = await supertest(app)
        .get('/accounts?limit=2')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.accounts).toHaveLength(2);
      expect(response.body.pagination.total).toBe(3);
      expect(response.body.pagination.limit).toBe(2);
    });

    it('respects page parameter', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Account 1',
      });
      await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Account 2',
      });
      await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Account 3',
      });

      const response = await supertest(app)
        .get('/accounts?limit=2&page=2')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.accounts).toHaveLength(1);
      expect(response.body.pagination.page).toBe(2);
    });
  });

  // =========================================================================
  // Tenant Isolation
  // =========================================================================

  describe('tenant isolation', () => {
    it('returns only organization accounts', async () => {
      const { user: user1, organization: org1 } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const { organization: org2 } = await createTestUser();

      const cookie = await loginAndGetCookie(user1.email, VALID_PASSWORD);

      const { agent: agent1 } = await createTestAgent({ organizationId: org1.id });
      const { agent: agent2 } = await createTestAgent({ organizationId: org2.id });

      const { account: ownAccount } = await createTestAccount({
        organizationId: org1.id,
        agentId: agent1.id,
      });
      await createTestAccount({ organizationId: org2.id, agentId: agent2.id });

      const response = await supertest(app).get('/accounts').set('Cookie', cookie).expect(200);

      const accountsList = response.body.accounts as Array<{ id: string }>;
      expect(accountsList).toHaveLength(1);
      expect(accountsList[0]?.id).toBe(ownAccount.id);
    });
  });
});
