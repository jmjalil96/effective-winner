import { beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../db/schema/index.js';

// =============================================================================
// Test Database Singleton
// =============================================================================

let container: StartedPostgreSqlContainer;
let testClient: ReturnType<typeof postgres>;

// Global test database instance - accessed by the db mock
declare global {
  var __testDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  var __testClient: ReturnType<typeof postgres> | undefined;
}

export const getTestDb = () => {
  if (!globalThis.__testDb) {
    throw new Error('Test database not initialized. Ensure beforeAll has run.');
  }
  return globalThis.__testDb;
};

export const getTestClient = () => globalThis.__testClient;

// =============================================================================
// Mock Logger (suppress logs during tests)
// =============================================================================

vi.mock('../config/logger.js', () => {
  const createMockLogger = (): Record<string, unknown> => {
    const mock: Record<string, unknown> = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      silent: vi.fn(),
      level: 'silent',
      levels: {
        values: {
          silent: Infinity,
          fatal: 60,
          error: 50,
          warn: 40,
          info: 30,
          debug: 20,
          trace: 10,
        },
      },
      child: vi.fn(() => createMockLogger()),
      bindings: vi.fn(() => ({})),
      flush: vi.fn(),
      isLevelEnabled: vi.fn(() => false),
    };
    return mock;
  };
  const mockLogger = createMockLogger();
  return {
    logger: mockLogger,
    createChildLogger: vi.fn(() => createMockLogger()),
    genReqId: vi.fn(() => 'test-request-id'),
  };
});

// =============================================================================
// Mock Email Queue (prevent actual email sends)
// =============================================================================

vi.mock('../lib/services/email/jobs.js', () => ({
  queueAccountLockedEmail: vi.fn().mockResolvedValue(undefined),
  queuePasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  queuePasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  queueEmailVerificationEmail: vi.fn().mockResolvedValue(undefined),
  queueInvitationEmail: vi.fn().mockResolvedValue(undefined),
  emailQueue: {
    addJob: vi.fn().mockResolvedValue(undefined),
  },
  initEmailWorker: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// Mock Queue Connection (prevent Redis connection)
// =============================================================================

vi.mock('../lib/services/queue/connection.js', () => ({
  getConnection: vi.fn(() => null),
  closeConnection: vi.fn().mockResolvedValue(undefined),
  setConnection: vi.fn(),
}));

// =============================================================================
// Mock DB Module (proxy to test database)
// =============================================================================

vi.mock('../db/index.js', () => ({
  get db() {
    if (!globalThis.__testDb) {
      throw new Error('Test database not initialized');
    }
    return globalThis.__testDb;
  },
  closeDb: () => globalThis.__testClient?.end(),
}));

// =============================================================================
// Global Setup
// =============================================================================

beforeAll(async () => {
  // Start PostgreSQL container
  container = await new PostgreSqlContainer('postgres:17')
    .withDatabase('crm_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const connectionString = container.getConnectionUri();

  // Create connection
  testClient = postgres(connectionString);
  globalThis.__testClient = testClient;
  globalThis.__testDb = drizzle(testClient, { schema });

  // Run migrations
  await migrate(globalThis.__testDb, { migrationsFolder: './drizzle' });

  // Stub environment variables
  vi.stubEnv('DATABASE_URL', connectionString);
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
  vi.stubEnv('FRONTEND_URL', 'http://localhost:5173');
  vi.stubEnv('SUPPORT_EMAIL', 'support@test.com');
}, 120000);

afterAll(async () => {
  await testClient.end();
  await container.stop();
  globalThis.__testDb = undefined;
  globalThis.__testClient = undefined;
});
