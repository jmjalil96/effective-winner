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
import {
  createTestAgent,
  createTestAccount,
  createTestClient,
} from '../../../test/helpers/agent.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { accounts, auditLogs, users } from '../../../db/schema/index.js';
import { ACCOUNT_ERRORS } from '../constants.js';
import { AUDIT_ACTIONS } from '../../../lib/services/index.js';

describe('DELETE /accounts/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).delete(`/accounts/${uuidv7()}`).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .delete(`/accounts/${uuidv7()}`)
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:delete'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app)
        .delete(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without accounts:delete permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['accounts:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .delete(`/accounts/${uuidv7()}`)
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
        permissionNames: ['accounts:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete('/accounts/not-a-uuid')
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
        permissionNames: ['accounts:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete(`/accounts/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
    });

    it('returns 404 when account is soft-deleted', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        deleted: true,
      });

      const response = await supertest(app)
        .delete(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
    });

    it('returns 404 when account belongs to different organization', async () => {
      const { user: user1 } = await createTestUser({
        permissionNames: ['accounts:delete'],
      });
      const { organization: org2 } = await createTestUser();
      const { agent: agent2 } = await createTestAgent({ organizationId: org2.id });
      const { account: account2 } = await createTestAccount({
        organizationId: org2.id,
        agentId: agent2.id,
      });

      const cookie = await loginAndGetCookie(user1.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete(`/accounts/${account2.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.ACCOUNT_NOT_FOUND);
    });
  });

  // =========================================================================
  // Conflict Errors (409)
  // =========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when account has associated clients', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      // Create client linked to this account
      await createTestClient({
        organizationId: organization.id,
        accountId: account.id,
      });

      const response = await supertest(app)
        .delete(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .expect(409);

      expect(response.body.error.message).toBe(ACCOUNT_ERRORS.CANNOT_DELETE_WITH_DATA);
    });
  });

  // =========================================================================
  // Success Cases (204)
  // =========================================================================

  describe('success cases (204)', () => {
    it('soft-deletes account (sets deletedAt)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      await supertest(app).delete(`/accounts/${account.id}`).set('Cookie', cookie).expect(204);

      // Verify soft delete in database
      const db = getTestDb();
      const [dbAccount] = await db.select().from(accounts).where(eq(accounts.id, account.id));

      expect(dbAccount?.deletedAt).not.toBeNull();
    });

    it('returns 204 with no content', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
      });

      const response = await supertest(app)
        .delete(`/accounts/${account.id}`)
        .set('Cookie', cookie)
        .expect(204);

      expect(response.body).toEqual({});
    });
  });

  // =========================================================================
  // Audit Logging
  // =========================================================================

  describe('audit logging', () => {
    it('creates audit log entry with metadata', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['accounts:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const { account } = await createTestAccount({
        organizationId: organization.id,
        agentId: agent.id,
        name: 'Account To Delete',
      });

      await supertest(app).delete(`/accounts/${account.id}`).set('Cookie', cookie).expect(204);

      const db = getTestDb();
      const log = await pollUntil(async () => {
        const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, account.id));
        return entry;
      });

      expect(log).toBeDefined();
      expect(log.action).toBe(AUDIT_ACTIONS.ACCOUNT_DELETE);
      expect(log.entityType).toBe('account');
      expect(log.actorId).toBe(user.id);
      expect(log.organizationId).toBe(organization.id);
      expect(log.metadata).toMatchObject({
        accountId: account.accountId,
        name: 'Account To Delete',
      });
    });
  });
});
