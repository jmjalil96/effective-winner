import { uuidv7 } from 'uuidv7';
import { getTestDb } from '../setup.js';
import {
  agents,
  accounts,
  clients,
  type Agent,
  type Account,
  type Client,
} from '../../db/schema/index.js';

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
  accountId?: string;
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
  // Keep accountId short (max 20 chars: ACC-XXXX = 8 chars)
  const shortId = Math.random().toString(36).slice(2, 6).toUpperCase();
  const uniqueId = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

  const [account] = await db
    .insert(accounts)
    .values({
      id: uuidv7(),
      organizationId: options.organizationId,
      accountId: options.accountId ?? `ACC-${shortId}`,
      agentId: options.agentId,
      name: options.name ?? `Account-${uniqueId}`,
      status: options.status ?? 'active',
      deletedAt: options.deleted ? new Date() : null,
    })
    .returning();

  if (!account) throw new Error('Failed to create test account');

  return { account };
};

// =============================================================================
// Client Creation
// =============================================================================

export interface CreateTestClientOptions {
  organizationId: string;
  accountId: string;
  clientId?: string;
  clientType?: 'individual' | 'business';
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  govIdType?: string | null;
  govIdNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  sex?: string | null;
  dob?: string | null;
  businessDescription?: string | null;
  status?: string;
  deleted?: boolean;
}

export interface CreateTestClientResult {
  client: Client;
}

export const createTestClient = async (
  options: CreateTestClientOptions
): Promise<CreateTestClientResult> => {
  const db = getTestDb();
  const uniqueId = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
  const shortId = Math.random().toString(36).slice(2, 6).toUpperCase();

  const clientType = options.clientType ?? 'individual';
  const firstName = options.firstName ?? (clientType === 'individual' ? 'Test' : null);
  const lastName = options.lastName ?? (clientType === 'individual' ? 'Client' : null);
  const companyName = options.companyName ?? (clientType === 'business' ? `Company-${uniqueId}` : null);

  // Compute name if not provided
  const name =
    options.name ??
    (clientType === 'individual'
      ? `${firstName ?? 'Test'} ${lastName ?? 'Client'}`
      : companyName ?? `Client-${uniqueId}`);

  const [client] = await db
    .insert(clients)
    .values({
      id: uuidv7(),
      organizationId: options.organizationId,
      accountId: options.accountId,
      clientId: options.clientId ?? `CLT-${shortId}`,
      clientType,
      name,
      firstName,
      lastName,
      companyName,
      govIdType: options.govIdType ?? null,
      govIdNumber: options.govIdNumber ?? null,
      phone: options.phone ?? null,
      email: options.email ?? null,
      sex: options.sex ?? null,
      dob: options.dob ?? null,
      businessDescription: options.businessDescription ?? null,
      status: options.status ?? 'active',
      deletedAt: options.deleted ? new Date() : null,
    })
    .returning();

  if (!client) throw new Error('Failed to create test client');

  return { client };
};
