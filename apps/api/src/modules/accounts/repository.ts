import { eq, and, isNull, sql, asc, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { accounts, agents, idCounters } from '../../db/schema/index.js';
import { AppError } from '../../errors/index.js';

// =============================================================================
// Interfaces
// =============================================================================

export interface AccountRow {
  id: string;
  organizationId: string;
  accountId: string;
  agentId: string;
  agentFirstName: string | null;
  agentLastName: string | null;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRow {
  id: string;
  organizationId: string;
}

// =============================================================================
// ID Generation
// =============================================================================

export const getNextAccountId = async (organizationId: string): Promise<string> => {
  const result = await db
    .insert(idCounters)
    .values({
      organizationId,
      entityType: 'account',
      lastValue: 1,
    })
    .onConflictDoUpdate({
      target: [idCounters.organizationId, idCounters.entityType],
      set: {
        lastValue: sql`${idCounters.lastValue} + 1`,
      },
    })
    .returning({ lastValue: idCounters.lastValue });

  const value = result[0]?.lastValue ?? 1;
  return `ACC-${String(value).padStart(4, '0')}`;
};

// =============================================================================
// Queries
// =============================================================================

export const findAgentById = async (
  agentId: string,
  organizationId: string
): Promise<AgentRow | null> => {
  const result = await db
    .select({
      id: agents.id,
      organizationId: agents.organizationId,
    })
    .from(agents)
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.organizationId, organizationId),
        isNull(agents.deletedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
};

export const findAccountById = async (
  accountId: string,
  organizationId: string
): Promise<AccountRow | null> => {
  const result = await db
    .select({
      id: accounts.id,
      organizationId: accounts.organizationId,
      accountId: accounts.accountId,
      agentId: accounts.agentId,
      agentFirstName: agents.firstName,
      agentLastName: agents.lastName,
      name: accounts.name,
      status: accounts.status,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
    })
    .from(accounts)
    .leftJoin(agents, eq(accounts.agentId, agents.id))
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.organizationId, organizationId),
        isNull(accounts.deletedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
};

// =============================================================================
// Commands
// =============================================================================

export interface CreateAccountParams {
  organizationId: string;
  accountId: string;
  agentId: string;
  name: string;
  status?: string;
}

export interface CreateAccountResult {
  id: string;
  organizationId: string;
  accountId: string;
  agentId: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export const createAccount = async (params: CreateAccountParams): Promise<CreateAccountResult> => {
  const result = await db
    .insert(accounts)
    .values({
      organizationId: params.organizationId,
      accountId: params.accountId,
      agentId: params.agentId,
      name: params.name,
      status: params.status ?? 'active',
    })
    .returning({
      id: accounts.id,
      organizationId: accounts.organizationId,
      accountId: accounts.accountId,
      agentId: accounts.agentId,
      name: accounts.name,
      status: accounts.status,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
    });

  const account = result[0];
  if (!account) throw new AppError('Failed to create account', 500, 'DB_INSERT_FAILED');
  return account;
};

export interface UpdateAccountParams {
  agentId?: string;
  name?: string;
  status?: string;
}

export interface UpdateAccountResult {
  id: string;
  organizationId: string;
  accountId: string;
  agentId: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export const updateAccount = async (
  accountId: string,
  organizationId: string,
  params: UpdateAccountParams
): Promise<UpdateAccountResult> => {
  const result = await db
    .update(accounts)
    .set({
      ...(params.agentId !== undefined && { agentId: params.agentId }),
      ...(params.name !== undefined && { name: params.name }),
      ...(params.status !== undefined && { status: params.status }),
    })
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.organizationId, organizationId),
        isNull(accounts.deletedAt)
      )
    )
    .returning({
      id: accounts.id,
      organizationId: accounts.organizationId,
      accountId: accounts.accountId,
      agentId: accounts.agentId,
      name: accounts.name,
      status: accounts.status,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
    });

  const account = result[0];
  if (!account) throw new AppError('Failed to update account', 500, 'DB_UPDATE_FAILED');
  return account;
};

// =============================================================================
// List
// =============================================================================

export interface ListAccountsParams {
  organizationId: string;
  page: number;
  limit: number;
  status?: string;
  agentName?: string;
  search?: string;
  sortBy: 'name' | 'status' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

export interface ListAccountsResult {
  accounts: AccountRow[];
  total: number;
}

export const listAccounts = async (params: ListAccountsParams): Promise<ListAccountsResult> => {
  const { organizationId, page, limit, status, agentName, search, sortBy, sortOrder } = params;
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = [
    eq(accounts.organizationId, organizationId),
    isNull(accounts.deletedAt),
  ];

  if (status !== undefined) {
    conditions.push(eq(accounts.status, status));
  }

  if (agentName !== undefined) {
    const pattern = `%${agentName}%`;
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM agents a
        WHERE a.id = accounts.agent_id
          AND a.organization_id = ${organizationId}
          AND a.deleted_at IS NULL
          AND (a.first_name ILIKE ${pattern} OR a.last_name ILIKE ${pattern})
      )`
    );
  }

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      sql`(${accounts.accountId} ILIKE ${searchPattern} OR ${accounts.name} ILIKE ${searchPattern})`
    );
  }

  const whereClause = and(...conditions);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(accounts)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  // Get paginated results
  const sortColumn =
    sortBy === 'name' ? accounts.name : sortBy === 'status' ? accounts.status : accounts.createdAt;
  const orderDirection = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const result = await db
    .select({
      id: accounts.id,
      organizationId: accounts.organizationId,
      accountId: accounts.accountId,
      agentId: accounts.agentId,
      agentFirstName: agents.firstName,
      agentLastName: agents.lastName,
      name: accounts.name,
      status: accounts.status,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
    })
    .from(accounts)
    .leftJoin(agents, eq(accounts.agentId, agents.id))
    .where(whereClause)
    .orderBy(orderDirection, asc(accounts.id))
    .limit(limit)
    .offset(offset);

  return { accounts: result, total };
};

// =============================================================================
// Delete
// =============================================================================

export const hasAccountRelatedData = async (
  accountId: string,
  organizationId: string
): Promise<boolean> => {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM clients
      WHERE account_id = ${accountId}
        AND organization_id = ${organizationId}
        AND deleted_at IS NULL
      LIMIT 1
    ) AS has_data
  `);
  return result[0]?.['has_data'] === true;
};

export const softDeleteAccount = async (
  accountId: string,
  organizationId: string
): Promise<void> => {
  await db
    .update(accounts)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.organizationId, organizationId),
        isNull(accounts.deletedAt)
      )
    );
};
