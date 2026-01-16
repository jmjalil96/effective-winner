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
import { agents, auditLogs, users } from '../../../db/schema/index.js';
import { AGENT_ERRORS } from '../constants.js';
import { AUDIT_ACTIONS } from '../../../lib/services/index.js';

const BASE_PAYLOAD = {
  firstName: 'Ana',
  lastName: 'Rojas',
  email: 'ana@example.com',
  dob: '1990-01-01',
};

describe('POST /agents', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).post('/agents').send(BASE_PAYLOAD).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', 'sid=invalidsessionid123')
        .send(BASE_PAYLOAD)
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:create'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send(BASE_PAYLOAD)
        .expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without agents:create permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send(BASE_PAYLOAD)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send(BASE_PAYLOAD)
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
        permissionNames: ['agents:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send({ firstName: 'Ana' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid email', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send({ ...BASE_PAYLOAD, email: 'not-an-email' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid dob format', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send({ ...BASE_PAYLOAD, dob: '01/01/1990' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Conflict Errors (409)
  // =========================================================================

  describe('conflict errors (409)', () => {
    it('returns 409 when house agent already exists', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({ organizationId: organization.id, isHouseAgent: true });

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send({ ...BASE_PAYLOAD, isHouseAgent: true })
        .expect(409);

      expect(response.body.error.message).toBe(AGENT_ERRORS.HOUSE_AGENT_EXISTS);
    });

    it('returns 409 when email already exists (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({
        organizationId: organization.id,
        email: 'test@example.com',
      });

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send({ ...BASE_PAYLOAD, email: 'TEST@example.com' })
        .expect(409);

      expect(response.body.error.message).toBe(AGENT_ERRORS.EMAIL_EXISTS);
    });
  });

  // =========================================================================
  // Success (201)
  // =========================================================================

  describe('success (201)', () => {
    it('creates agent and returns response', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send(BASE_PAYLOAD)
        .expect(201);

      expect(response.body).toHaveProperty('agent');
      expect(response.body.agent.firstName).toBe('Ana');
      expect(response.body.agent.lastName).toBe('Rojas');
      expect(response.body.agent.email).toBe('ana@example.com');
      expect(response.body.agent.status).toBe('active');
      expect(response.body.agent.isHouseAgent).toBe(false);
      expect(response.body.agent.agentId).toMatch(/^AGT-\d{4}$/);
    });

    it('persists agent in database', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send(BASE_PAYLOAD)
        .expect(201);

      const db = getTestDb();
      const createdAgentId = String(response.body.agent.id);
      const [agent] = await db.select().from(agents).where(eq(agents.id, createdAgentId));

      expect(agent).toBeDefined();
      expect(agent?.email).toBe('ana@example.com');
      expect(agent?.isHouseAgent).toBe(false);
    });

    it('writes audit log entry', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:create'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .post('/agents')
        .set('Cookie', cookie)
        .send(BASE_PAYLOAD)
        .expect(201);

      const db = getTestDb();
      const createdAgentId = String(response.body.agent.id);
      const log = await pollUntil(async () => {
        const [row] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, createdAgentId));
        return row;
      });
      expect(log.action).toBe(AUDIT_ACTIONS.AGENT_CREATE);
      expect(log.entityType).toBe('agent');
      const auditAgentId = String(response.body.agent.agentId);
      expect(log.metadata).toMatchObject({
        agentId: auditAgentId,
        firstName: 'Ana',
        lastName: 'Rojas',
        isHouseAgent: false,
      });
    });
  });
});
