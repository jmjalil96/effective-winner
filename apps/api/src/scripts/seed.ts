import { eq } from 'drizzle-orm';
import { db, closeDb } from '../db/index.js';
import {
  organizations,
  roles,
  users,
  profiles,
  permissions,
  rolePermissions,
  agents,
  accounts,
  clients,
  idCounters,
} from '../db/schema/index.js';
import { hashPassword } from '../lib/crypto.js';
import { logger } from '../config/logger.js';

// =============================================================================
// Configuration
// =============================================================================

const TEST_PASSWORD = 'TestPassword123!';
const ORG_SLUG = 'acme-insurance';

const ROLE_PERMISSIONS = {
  Admin: null, // All permissions
  Manager: [
    'roles:read',
    'invitations:read',
    'agents:read',
    'agents:create',
    'agents:update',
    'agents:delete',
    'accounts:read',
    'accounts:create',
    'accounts:update',
    'accounts:delete',
    'clients:read',
    'clients:create',
    'clients:update',
    'clients:delete',
  ],
  Viewer: [
    'roles:read',
    'invitations:read',
    'agents:read',
    'accounts:read',
    'clients:read',
  ],
  'Agent Manager': ['agents:read', 'agents:create', 'agents:update', 'agents:delete'],
};

const USERS = [
  { email: 'admin@acme.test', role: 'Admin', firstName: 'Admin', lastName: 'User' },
  { email: 'manager@acme.test', role: 'Manager', firstName: 'Manager', lastName: 'User' },
  { email: 'viewer@acme.test', role: 'Viewer', firstName: 'Viewer', lastName: 'User' },
  { email: 'agent-only@acme.test', role: 'Agent Manager', firstName: 'Agent', lastName: 'Manager' },
];

const AGENTS = [
  {
    agentId: 'AGT-0001',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@agents.test',
    phone: '+1-555-0101',
    isHouseAgent: true,
  },
  {
    agentId: 'AGT-0002',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@agents.test',
    phone: '+1-555-0102',
    isHouseAgent: false,
  },
  {
    agentId: 'AGT-0003',
    firstName: 'Bob',
    lastName: 'Wilson',
    email: 'bob.wilson@agents.test',
    phone: '+1-555-0103',
    isHouseAgent: false,
  },
];

const ACCOUNTS = [
  { accountId: 'ACC-0001', name: 'Premium Account', agentIndex: 0 },
  { accountId: 'ACC-0002', name: 'Standard Account', agentIndex: 1 },
  { accountId: 'ACC-0003', name: 'Basic Account', agentIndex: 1 },
];

const CLIENTS = [
  {
    clientId: 'CLT-0001',
    clientType: 'individual',
    firstName: 'Alice',
    lastName: 'Johnson',
    name: 'Alice Johnson',
    email: 'alice@clients.test',
    phone: '+1-555-1001',
    accountIndex: 0,
  },
  {
    clientId: 'CLT-0002',
    clientType: 'individual',
    firstName: 'Charlie',
    lastName: 'Brown',
    name: 'Charlie Brown',
    email: 'charlie@clients.test',
    phone: '+1-555-1002',
    accountIndex: 0,
  },
  {
    clientId: 'CLT-0003',
    clientType: 'business',
    companyName: 'Acme Corp',
    name: 'Acme Corp',
    email: 'info@acmecorp.test',
    phone: '+1-555-2001',
    businessDescription: 'General manufacturing and distribution',
    accountIndex: 1,
  },
  {
    clientId: 'CLT-0004',
    clientType: 'individual',
    firstName: 'Diana',
    lastName: 'Prince',
    name: 'Diana Prince',
    email: 'diana@clients.test',
    phone: '+1-555-1003',
    accountIndex: 2,
  },
];

// =============================================================================
// Seed Functions
// =============================================================================

const seed = async () => {
  logger.info('Starting seed...');

  // Check if org already exists
  const existingOrg = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, ORG_SLUG))
    .limit(1);

  if (existingOrg.length > 0) {
    logger.info('Seed data already exists. Skipping...');
    return;
  }

  // 1. Create organization
  logger.info('Creating organization...');
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Acme Insurance',
      slug: ORG_SLUG,
      billingEmail: 'billing@acme.test',
    })
    .returning({ id: organizations.id });

  if (!org) throw new Error('Failed to create organization');

  // 2. Get all permissions
  const allPermissions = await db.select().from(permissions);
  const permissionsByName = new Map(allPermissions.map((p) => [p.name, p.id]));

  // 3. Create roles
  logger.info('Creating roles...');
  const roleIds: Record<string, string> = {};

  for (const [roleName, rolePerms] of Object.entries(ROLE_PERMISSIONS)) {
    const isAdmin = roleName === 'Admin';

    const [role] = await db
      .insert(roles)
      .values({
        organizationId: org.id,
        name: roleName,
        description: `${roleName} role`,
        isDefault: isAdmin,
      })
      .returning({ id: roles.id });

    if (!role) throw new Error(`Failed to create role: ${roleName}`);
    roleIds[roleName] = role.id;

    // Link permissions
    const permsToLink = isAdmin
      ? allPermissions.map((p) => p.id)
      : (rolePerms ?? []).map((name) => permissionsByName.get(name)).filter(Boolean);

    if (permsToLink.length > 0) {
      await db.insert(rolePermissions).values(
        permsToLink.map((permId) => ({
          roleId: role.id,
          permissionId: permId as string,
        }))
      );
    }
  }

  // 4. Create users
  logger.info('Creating users...');
  const passwordHash = await hashPassword(TEST_PASSWORD);

  for (const userData of USERS) {
    const roleId = roleIds[userData.role];
    if (!roleId) throw new Error(`Role not found: ${userData.role}`);

    const [user] = await db
      .insert(users)
      .values({
        organizationId: org.id,
        roleId,
        email: userData.email,
        passwordHash,
        emailVerifiedAt: new Date(), // Pre-verified for testing
        isActive: true,
      })
      .returning({ id: users.id });

    if (!user) throw new Error(`Failed to create user: ${userData.email}`);

    await db.insert(profiles).values({
      userId: user.id,
      firstName: userData.firstName,
      lastName: userData.lastName,
    });
  }

  // 5. Set up ID counters
  await db.insert(idCounters).values([
    { organizationId: org.id, entityType: 'agent', lastValue: 3 },
    { organizationId: org.id, entityType: 'account', lastValue: 3 },
    { organizationId: org.id, entityType: 'client', lastValue: 4 },
  ]);

  // 6. Create agents
  logger.info('Creating agents...');
  const agentIds: string[] = [];

  for (const agentData of AGENTS) {
    const [agent] = await db
      .insert(agents)
      .values({
        organizationId: org.id,
        agentId: agentData.agentId,
        firstName: agentData.firstName,
        lastName: agentData.lastName,
        email: agentData.email,
        phone: agentData.phone,
        isHouseAgent: agentData.isHouseAgent,
        status: 'active',
      })
      .returning({ id: agents.id });

    if (!agent) throw new Error(`Failed to create agent: ${agentData.agentId}`);
    agentIds.push(agent.id);
  }

  // 7. Create accounts
  logger.info('Creating accounts...');
  const accountIds: string[] = [];

  for (const accountData of ACCOUNTS) {
    const agentId = agentIds[accountData.agentIndex];
    if (!agentId) throw new Error(`Agent not found at index: ${String(accountData.agentIndex)}`);

    const [account] = await db
      .insert(accounts)
      .values({
        organizationId: org.id,
        accountId: accountData.accountId,
        agentId,
        name: accountData.name,
        status: 'active',
      })
      .returning({ id: accounts.id });

    if (!account) throw new Error(`Failed to create account: ${accountData.accountId}`);
    accountIds.push(account.id);
  }

  // 8. Create clients
  logger.info('Creating clients...');

  for (const clientData of CLIENTS) {
    const accountId = accountIds[clientData.accountIndex];
    if (!accountId) throw new Error(`Account not found at index: ${String(clientData.accountIndex)}`);

    await db.insert(clients).values({
      organizationId: org.id,
      clientId: clientData.clientId,
      accountId,
      clientType: clientData.clientType,
      name: clientData.name,
      firstName: clientData.firstName ?? null,
      lastName: clientData.lastName ?? null,
      companyName: clientData.companyName ?? null,
      email: clientData.email,
      phone: clientData.phone,
      businessDescription: clientData.businessDescription ?? null,
      status: 'active',
    });
  }

  logger.info('Seed completed successfully!');
  logger.info('');
  logger.info('=== Test Credentials ===');
  logger.info(`Password for all users: ${TEST_PASSWORD}`);
  logger.info('');
  logger.info('Users:');
  for (const user of USERS) {
    logger.info(`  - ${user.email} (${user.role})`);
  }
  logger.info('');
  logger.info('Agents: AGT-0001, AGT-0002, AGT-0003');
  logger.info('Accounts: ACC-0001, ACC-0002, ACC-0003');
  logger.info('Clients: CLT-0001, CLT-0002, CLT-0003, CLT-0004');
};

// =============================================================================
// Main
// =============================================================================

seed()
  .then(() => closeDb())
  .catch((err: unknown) => {
    logger.error({ err }, 'Seed failed');
    process.exit(1);
  });
