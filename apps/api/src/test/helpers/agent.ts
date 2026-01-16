import { uuidv7 } from 'uuidv7';
import { getTestDb } from '../setup.js';
import { agents, accounts, type Agent, type Account } from '../../db/schema/index.js';

// =============================================================================
// Agent Creation
// =============================================================================

export interface CreateTestAgentOptions {
  organizationId: string;
  agentId?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  govIdType?: string | null;
  govIdNumber?: string | null;
  dob?: string | null;
  status?: string;
  isHouseAgent?: boolean;
  deleted?: boolean;
}

export interface CreateTestAgentResult {
  agent: Agent;
}

export const createTestAgent = async (
  options: CreateTestAgentOptions
): Promise<CreateTestAgentResult> => {
  const db = getTestDb();
  const uniqueId = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

  const [agent] = await db
    .insert(agents)
    .values({
      id: uuidv7(),
      organizationId: options.organizationId,
      agentId: options.agentId ?? `AGT-${uniqueId}`,
      firstName: options.firstName ?? 'Test',
      lastName: options.lastName ?? 'Agent',
      govIdType: options.govIdType ?? null,
      govIdNumber: options.govIdNumber ?? null,
      email: options.email ?? null,
      phone: options.phone ?? null,
      dob: options.dob ?? null,
      status: options.status ?? 'active',
      isHouseAgent: options.isHouseAgent ?? false,
      deletedAt: options.deleted ? new Date() : null,
    })
    .returning();

  if (!agent) throw new Error('Failed to create test agent');

  return { agent };
};

// =============================================================================
// Account Creation
// =============================================================================

export interface CreateTestAccountOptions {
  organizationId: string;
  agentId: string;
  name?: string;
  status?: string;
  deleted?: boolean;
}

export interface CreateTestAccountResult {
  account: Account;
}

export const createTestAccount = async (
  options: CreateTestAccountOptions
): Promise<CreateTestAccountResult> => {
  const db = getTestDb();
  const uniqueId = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

  const [account] = await db
    .insert(accounts)
    .values({
      id: uuidv7(),
      organizationId: options.organizationId,
      agentId: options.agentId,
      name: options.name ?? `Account-${uniqueId}`,
      status: options.status ?? 'active',
      deletedAt: options.deleted ? new Date() : null,
    })
    .returning();

  if (!account) throw new Error('Failed to create test account');

  return { account };
};
