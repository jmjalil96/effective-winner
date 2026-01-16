/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestAgent } from '../../../test/helpers/agent.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { agents, users } from '../../../db/schema/index.js';

describe('GET /agents', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).get('/agents').expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .get('/agents')
        .set('Cookie', 'sid=invalidsessionid123')
        .expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with expired session', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });

      const { cookie } = await createDirectSession({
        userId: user.id,
        organizationId: organization.id,
        expiresInMs: -60 * 60 * 1000,
      });

      const response = await supertest(app).get('/agents').set('Cookie', cookie).expect(401);

      expect(response.body.error.message).toBe('Session expired');
    });
  });

  // =========================================================================
  // Forbidden Errors (403)
  // =========================================================================

  describe('forbidden errors (403)', () => {
    it('returns 403 without agents:read permission', async () => {
      const { user } = await createTestUser();
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app).get('/agents').set('Cookie', cookie).expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app).get('/agents').set('Cookie', cookie).expect(403);

      expect(response.body.error.message).toBe('Account deactivated');
    });
  });

  // =========================================================================
  // Success (200)
  // =========================================================================

  describe('success (200)', () => {
    it('returns agents with pagination', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({ organizationId: organization.id, firstName: 'Ana' });
      await createTestAgent({ organizationId: organization.id, firstName: 'Ben' });

      const response = await supertest(app)
        .get('/agents?limit=1&page=1')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.agents.length).toBe(1);
      expect(response.body.pagination.total).toBe(2);
    });

    it('filters by status and isHouseAgent', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({ organizationId: organization.id, status: 'inactive' });
      await createTestAgent({
        organizationId: organization.id,
        isHouseAgent: true,
        status: 'active',
      });

      const response = await supertest(app)
        .get('/agents?status=active&isHouseAgent=true')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.agents.length).toBe(1);
      expect(response.body.agents[0].isHouseAgent).toBe(true);
      expect(response.body.agents[0].status).toBe('active');
    });

    it('searches by agentId', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({ organizationId: organization.id, agentId: 'AGT-1234' });
      await createTestAgent({ organizationId: organization.id, agentId: 'AGT-5678' });

      const response = await supertest(app)
        .get('/agents?search=AGT-1234')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.agents.length).toBe(1);
      expect(response.body.agents[0].agentId).toBe('AGT-1234');
    });

    it('searches by firstName (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({
        organizationId: organization.id,
        firstName: 'Carlos',
        lastName: 'Ruiz',
      });
      await createTestAgent({
        organizationId: organization.id,
        firstName: 'Maria',
        lastName: 'Lopez',
      });

      const response = await supertest(app)
        .get('/agents?search=carl')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.agents.length).toBe(1);
      expect(response.body.agents[0].firstName).toBe('Carlos');
    });

    it('searches by lastName (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({
        organizationId: organization.id,
        firstName: 'Carlos',
        lastName: 'Fernandez',
      });
      await createTestAgent({
        organizationId: organization.id,
        firstName: 'Maria',
        lastName: 'Lopez',
      });

      const response = await supertest(app)
        .get('/agents?search=FERN')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.agents.length).toBe(1);
      expect(response.body.agents[0].lastName).toBe('Fernandez');
    });

    it('searches by email (case-insensitive)', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({ organizationId: organization.id, email: 'carlos@company.com' });
      await createTestAgent({ organizationId: organization.id, email: 'maria@company.com' });

      const response = await supertest(app)
        .get('/agents?search=CARLOS@')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.agents.length).toBe(1);
      expect(response.body.agents[0].email).toBe('carlos@company.com');
    });

    it('excludes soft-deleted agents', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({ organizationId: organization.id, deleted: true });
      await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app).get('/agents').set('Cookie', cookie).expect(200);

      expect(response.body.agents.length).toBe(1);
    });

    it('returns organization agents only', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent: ownAgent } = await createTestAgent({ organizationId: organization.id });
      const { organization: otherOrg } = await createTestUser();
      await createTestAgent({ organizationId: otherOrg.id });

      const response = await supertest(app).get('/agents').set('Cookie', cookie).expect(200);

      // Should only return the agent from our organization, not the other org's agent
      const agentsList = response.body.agents as Array<{ id: string }>;
      expect(agentsList).toHaveLength(1);
      expect(agentsList[0]?.id).toBe(ownAgent.id);
    });

    it('returns correct response fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      await createTestAgent({ organizationId: organization.id });

      const response = await supertest(app).get('/agents').set('Cookie', cookie).expect(200);

      const agentsList = response.body.agents as Array<{
        id: string;
        agentId: string;
        firstName: string;
        lastName: string;
        status: string;
        createdAt: string;
        updatedAt: string;
      }>;
      const agent = agentsList[0];
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('agentId');
      expect(agent).toHaveProperty('firstName');
      expect(agent).toHaveProperty('lastName');
      expect(agent).toHaveProperty('status');
      expect(agent).toHaveProperty('createdAt');
      expect(agent).toHaveProperty('updatedAt');
    });

    it('removes agents from list after deletion', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({ organizationId: organization.id });
      const db = getTestDb();
      await db.update(agents).set({ deletedAt: new Date() }).where(eq(agents.id, agent.id));

      const response = await supertest(app).get('/agents').set('Cookie', cookie).expect(200);

      const agentsList = response.body.agents as Array<{ id: string }>;
      expect(agentsList.find((item) => item.id === agent.id)).toBeFalsy();
    });
  });
});
