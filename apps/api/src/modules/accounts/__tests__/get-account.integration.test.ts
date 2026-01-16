/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestAgent, createTestAccount } from '../../../test/helpers/agent.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { users } from '../../../db/schema/index.js';
import { ACCOUNT_ERRORS } from '../constants.js';

describe('GET /accounts/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).get(`/accounts/${uuidv7()}`).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .get(`/accounts/${uuidv7()}`)
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

      const response = await supertest(app)
        .get(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(401);

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

      const response = await supertest(app)
        .get(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .get(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
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
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/accounts/not-a-uuid')
        .set('Cookie', cookie)
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
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
    });

    it('returns 404 when account is soft-deleted', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        deleted: true,
      });

      const response = await supertest(app)
        .get(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
    });

    it('returns 404 when account belongs to different organization', async () => {
      const { user: user1 } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const { organization: org2 } = await createTestUser();
      const { agent: agent2 } = await createTestAgent({ organizationId: org2.id });
      const { account: account2 } = await createTestAccount({
        organizationId: org2.id,
        agentId: agent2.id,
      });

      const cookie = await loginAndGetCookie(user1.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get(`/accounts/${account2.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
    });
  });

  // =========================================================================
  // Success Cases (200)
  // =========================================================================

  describe('success cases (200)', () => {
    it('returns account with correct shape', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Test Account',
      });

      const response = await supertest(app)
        .get(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body).toHaveProperty('account');
      expect(response.body.account.id).toBe(account.id);
      expect(response.body.account.agentId).toBe(agent.id);
      expect(response.body.account.name).toBe('Test Account');
      expect(response.body.account.status).toBe('active');
    });

    it('returns correct account data', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Premium Account',
        status: 'inactive',
      });

      const response = await supertest(app)
        .get(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.account.id).toBe(account.id);
      expect(response.body.account.name).toBe('Premium Account');
      expect(response.body.account.status).toBe('inactive');
      expect(response.body.account.agentId).toBe(agent.id);
    });
  });
});
