/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { app } from '../../../app.js';
import { getTestDb } from '../../../test/setup.js';
import { createTestUser } from '../../../test/fixtures/user.fixture.js';
import { cleanupDatabase } from '../../../test/helpers/db.js';
import { loginAndGetCookie, createDirectSession } from '../../../test/helpers/session.js';
import { createTestAgent } from '../../../test/helpers/agent.js';
import { VALID_PASSWORD } from '../../../test/helpers/crypto.js';
import { users } from '../../../db/schema/index.js';

describe('GET /agents/:id', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  // =========================================================================
  // Unauthorized Errors (401)
  // =========================================================================

  describe('unauthorized errors (401)', () => {
    it('returns 401 without session cookie', async () => {
      const response = await supertest(app).get(`/agents/${uuidv7()}`).expect(401);

      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await supertest(app)
        .get(`/agents/${uuidv7()}`)
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

      const response = await supertest(app)
        .get(`/agents/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(401);

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

      const response = await supertest(app)
        .get(`/agents/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when account is inactive', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const db = getTestDb();
      await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

      const response = await supertest(app)
        .get(`/agents/${uuidv7()}`)
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
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get('/agents/not-a-uuid')
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
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const response = await supertest(app)
        .get(`/agents/${uuidv7()}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for other organization agent', async () => {
      const { user } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { organization: otherOrg } = await createTestUser();
      const { agent } = await createTestAgent({ organizationId: otherOrg.id });

      const response = await supertest(app)
        .get(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('returns 404 for soft-deleted agent', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({
        organizationId: organization.id,
        deleted: true,
      });

      const response = await supertest(app)
        .get(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });
  });

  // =========================================================================
  // Success (200)
  // =========================================================================

  describe('success (200)', () => {
    it('returns agent with correct fields', async () => {
      const { user, organization } = await createTestUser({
        permissionNames: ['agents:read'],
      });
      const cookie = await loginAndGetCookie(user.email, VALID_PASSWORD);

      const { agent } = await createTestAgent({
        organizationId: organization.id,
        firstName: 'Lucia',
        lastName: 'Gomez',
        email: 'lucia@example.com',
      });

      const response = await supertest(app)
        .get(`/agents/${agent.id}`)
        .set('Cookie', cookie)
        .expect(200);

      const payload = response.body.agent;
      expect(payload.id).toBe(agent.id);
      expect(payload.firstName).toBe('Lucia');
      expect(payload.lastName).toBe('Gomez');
      expect(payload.email).toBe('lucia@example.com');
      expect(typeof payload.createdAt).toBe('string');
      expect(typeof payload.updatedAt).toBe('string');
    });
  });
});
