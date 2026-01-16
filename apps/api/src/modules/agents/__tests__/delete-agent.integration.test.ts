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
import { agents, auditLogs, users } from '../../../db/schema/index.js';
import { AGENT_ERRORS } from '../constants.js';
import { AUDIT_ACTIONS } from '../../../lib/services/index.js';

describe('DELETE /agents/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).delete(`/agents/${uuidv7()}`).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .delete(`/agents/${uuidv7()}`)
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:delete'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app)
        .delete(`/agents/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without agents:delete permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete(`/agents/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .delete(`/agents/${uuidv7()}`)
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
        permissionNames: ['agents:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete('/agents/not-a-uuid')
        .set('Cookie', cookie)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Not Found Errors (404)
  // =========================================================================

  describe('not found errors (404)', () => {
    it('returns 404 for missing agent', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .delete(`/agents/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for other organization agent', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { organization: otherOrg } = await createTestUser();
      const { agent } = await createTestAgent({ organizationId: otherOrg.id });

      const response = await supertest(app)
        .delete(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for soft-deleted agent', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({
        organizationId: organization.id,
        deleted: true,
      });

      const response = await supertest(app)
        .delete(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });
  });

  // =========================================================================
  // Conflict Errors (409)
  // =========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when related data exists', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      await createTestAccount({ organizationId: organization.id, agentId: agent.id });

      const response = await supertest(app)
        .delete(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .expect(409);

      expect(response.body.error.message).toBe(AGENT_ERRORS.CANNOT_DELETE_WITH_DATA);
    });
  });

  // =========================================================================
  // Success (204)
  // =========================================================================

  describe('success (204)', () => {
    it('soft deletes agent', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });

      await supertest(app).delete(`/agents/${agent.id}`).set('Cookie', cookie).expect(204);

      const db = getTestDb();
      const [deleted] = await db.select().from(agents).where(eq(agents.id, agent.id));

      expect(deleted?.deletedAt).not.toBeNull();
    });

    it('writes audit log entry', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:delete'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({
        organizationId: organization.id,
        firstName: 'Delete',
        lastName: 'Me',
      });

      await supertest(app).delete(`/agents/${agent.id}`).set('Cookie', cookie).expect(204);

      const db = getTestDb();
      const log = await pollUntil(async () => {
        const [row] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, agent.id));
        return row;
      });
      expect(log.action).toBe(AUDIT_ACTIONS.AGENT_DELETE);
      expect(log.metadata).toMatchObject({
        agentId: agent.agentId,
        firstName: 'Delete',
        lastName: 'Me',
      });
    });
  });
});
