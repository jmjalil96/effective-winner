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
import { auditLogs, clients, users } from '../../../db/schema/index.js';
import { CLIENT_ERRORS } from '../constants.js';
import { AUDIT_ACTIONS } from '../../../lib/services/index.js';

describe('DELETE /clients/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).delete(`/clients/${uuidv7()}`).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .delete(`/clients/${uuidv7()}`)
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:delete'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app)
        .delete(`/clients/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without clients:delete permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete(`/clients/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .delete(`/clients/${uuidv7()}`)
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
        permissionNames: ['clients:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete('/clients/not-a-uuid')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Not Found Errors (404)
  // =========================================================================

  describe('not found errors (404)', () => {
    it('returns 404 when client does not exist', async () => {
      const { user } = await createTestUser({
        permissionNames: ['clients:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete(`/clients/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.CLIENT_NOT_FOUND);
    });

    it('returns 404 when client is soft-deleted', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:delete'],
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
        .delete(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.CLIENT_NOT_FOUND);
    });

    it('returns 404 when client belongs to different organization', async () => {
      const { user: user1 } = await createTestUser({
        permissionNames: ['clients:delete'],
      });
      const { organization: org2 } = await createTestUser();
      const { agent: agent2 } = await createTestAgent({ organizationId: org2.id });
      const { account: account2 } = await createTestAccount({
        organizationId: org2.id,
        agentId: agent2.id,
      });
      const { client: client2 } = await createTestClient({
        organizationId: org2.id,
        accountId: account2.id,
      });

      const cookie = await loginAndGetCookie(user1.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete(`/clients/${client2.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.CLIENT_NOT_FOUND);
    });
  });

  // =========================================================================
  // Success Cases (204)
  // =========================================================================

  describe('success cases (204)', () => {
    it('soft-deletes client (sets deletedAt)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:delete'],
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

      await supertest(app).delete(`/clients/${client.id}`).set('Cookie', cookie).expect(204);

      // Verify soft delete in database
      const db = getTestDb();
      const [dbClient] = await db.select().from(clients).where(eq(clients.id, client.id));

      expect(dbClient?.deletedAt).not.toBeNull();
    });

    it('returns 204 with no content', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:delete'],
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
        .delete(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .expect(204);

      expect(response.body).toEqual({});
    });

    it('deleted client cannot be fetched', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:delete', 'clients:read'],
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

      // Delete the client
      await supertest(app).delete(`/clients/${client.id}`).set('Cookie', cookie).expect(204);

      // Try to fetch the deleted client
      const response = await supertest(app)
        .get(`/clients/${client.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toBe(CLIENT_ERRORS.CLIENT_NOT_FOUND);
    });

    it('deleted client not in list', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:delete', 'clients:read'],
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

      // Delete the client
      await supertest(app).delete(`/clients/${client.id}`).set('Cookie', cookie).expect(204);

      // Fetch list of clients
      const response = await supertest(app).get('/clients').set('Cookie', cookie).expect(200);

      const clientIds = (response.body.clients as { id: string }[]).map((c) => c.id);
      expect(clientIds).not.toContain(client.id);
    });
  });

  // =========================================================================
  // Audit Logging
  // =========================================================================

  describe('audit logging', () => {
    it('creates audit log entry with metadata', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['clients:delete'],
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
        name: 'Client To Delete',
      });

      await supertest(app).delete(`/clients/${client.id}`).set('Cookie', cookie).expect(204);

      const db = getTestDb();
      const log = await pollUntil(async () => {
        const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, client.id));
        return entry;
      });

      expect(log).toBeDefined();
      expect(log.action).toBe(AUDIT_ACTIONS.CLIENT_DELETE);
      expect(log.entityType).toBe('client');
      expect(log.actorId).toBe(user.id);
      expect(log.organizationId).toBe(organization.id);
      expect(log.metadata).toMatchObject({
        clientId: client.clientId,
        name: 'Client To Delete',
      });
    });
  });
});
