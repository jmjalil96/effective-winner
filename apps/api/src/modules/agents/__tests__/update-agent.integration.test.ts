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
import { createTestAgent } from '../../../test/helpers/agent.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { auditLogs, users } from '../../../db/schema/index.js';
import { AGENT_ERRORS } from '../constants.js';
import { AUDIT_ACTIONS } from '../../../lib/services/index.js';

describe('PATCH /agents/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app)
        .patch(`/agents/${uuidv7()}`)
        .send({ firstName: 'Updated' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .patch(`/agents/${uuidv7()}`)
        .set('Cookie', 'sid=invalidsessionid123')
        .send({ firstName: 'Updated' })
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:update'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app)
        .patch(`/agents/${uuidv7()}`)
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
    it('returns 403 without agents:update permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch(`/agents/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .patch(`/agents/${uuidv7()}`)
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
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch('/agents/not-a-uuid')
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid email', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app)
        .patch(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid status', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app)
        .patch(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .send({ status: 'unknown' })
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
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .patch(`/agents/${uuidv7()}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for other organization agent', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { organization: otherOrg } = await createTestUser();
      const { agent } = await createTestAgent({ organizationId: otherOrg.id });

      const response = await supertest(app)
        .patch(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for soft-deleted agent', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({
        organizationId: organization.id,
        deleted: true,
      });

      const response = await supertest(app)
        .patch(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });
  });

  // =========================================================================
  // Conflict Errors (409)
  // =========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when setting house agent with existing house agent', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({ organizationId: organization.id, isHouseAgent: true });
      const { agent } = await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app)
        .patch(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .send({ isHouseAgent: true })
        .expect(409);

      expect(response.body.error.message).toBe(AGENT_ERRORS.HOUSE_AGENT_EXISTS);
    });

    it('returns 409 when email already exists', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({ organizationId: organization.id, email: 'exists@example.com' });
      const { agent } = await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app)
        .patch(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .send({ email: 'EXISTS@example.com' })
        .expect(409);

      expect(response.body.error.message).toBe(AGENT_ERRORS.EMAIL_EXISTS);
    });
  });

  // =========================================================================
  // Success (200)
  // =========================================================================

  describe('success (200)', () => {
    it('updates fields and returns agent', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({
        organizationId: organization.id,
        firstName: 'Lucia',
        email: 'lucia@example.com',
      });

      const response = await supertest(app)
        .patch(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Luciana', email: 'luciana@example.com' })
        .expect(200);

      expect(response.body.agent.firstName).toBe('Luciana');
      expect(response.body.agent.email).toBe('luciana@example.com');
    });

    it('returns existing agent for empty body', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({
        organizationId: organization.id,
        firstName: 'Keep',
      });

      const response = await supertest(app)
        .patch(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .send({})
        .expect(200);

      expect(response.body.agent.firstName).toBe('Keep');
    });

    it('updates the updatedAt timestamp', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({
        organizationId: organization.id,
        firstName: 'Test',
      });
      const originalUpdatedAt = agent.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 10));

      const response = await supertest(app)
        .patch(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .send({ firstName: 'Updated' })
        .expect(200);

      const newUpdatedAt = new Date(response.body.agent.updatedAt as string);
      expect(newUpdatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('writes audit log entry', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:update'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({
        organizationId: organization.id,
        firstName: 'Old',
        lastName: 'Name',
      });

      await supertest(app)
        .patch(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .send({ firstName: 'New' })
        .expect(200);

      const db = getTestDb();
      const log = await pollUntil(async () => {
        const [row] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, agent.id));
        return row;
      });
      expect(log.action).toBe(AUDIT_ACTIONS.AGENT_UPDATE);
      expect(log.changes).toMatchObject({
        before: { firstName: 'Old' },
        after: { firstName: 'New' },
      });
    });
  });
});
