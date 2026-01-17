import { eq, and, isNull, sql, asc, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { clients, accounts, idCounters } from '../../db/schema/index.js';
import { AppError } from '../../errors/index.js';

// =============================================================================
// Interfaces
// =============================================================================

export interface ClientRow {
  id: string;
  organizationId: string;
  clientId: string;
  accountId: string;
  accountName: string | null;
  clientType: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  govIdType: string | null;
  govIdNumber: string | null;
  phone: string | null;
  email: string | null;
  sex: string | null;
  dob: string | null;
  businessDescription: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountRow {
  id: string;
  organizationId: string;
}


// =============================================================================
// ID Generation
// =============================================================================

export const getNextClientId = async (organizationId: string): Promise<string> => {
  const result = await db
    .insert(idCounters)
    .values({
      organizationId,
      entityType: 'client',
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
  return `CLT-${String(value).padStart(4, '0')}`;
};

// =============================================================================
// Queries
// =============================================================================

export const findAccountById = async (
  accountId: string,
  organizationId: string
): Promise<AccountRow | null> => {
  const result = await db
    .select({
      id: accounts.id,
      organizationId: accounts.organizationId,
    })
    .from(accounts)
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

export const findClientByEmail = async (
  organizationId: string,
  email: string
): Promise<{ id: string } | null> => {
  const result = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        sql`LOWER(${clients.email}) = LOWER(${email})`,
        isNull(clients.deletedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
};

export const findClientByGovId = async (
  organizationId: string,
  govIdNumber: string
): Promise<{ id: string } | null> => {
  const result = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        eq(clients.govIdNumber, govIdNumber),
        isNull(clients.deletedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
};

export const findClientById = async (
  clientId: string,
  organizationId: string
): Promise<ClientRow | null> => {
  const result = await db
    .select({
      id: clients.id,
      organizationId: clients.organizationId,
      clientId: clients.clientId,
      accountId: clients.accountId,
      accountName: accounts.name,
      clientType: clients.clientType,
      name: clients.name,
      firstName: clients.firstName,
      lastName: clients.lastName,
      companyName: clients.companyName,
      govIdType: clients.govIdType,
      govIdNumber: clients.govIdNumber,
      phone: clients.phone,
      email: clients.email,
      sex: clients.sex,
      dob: clients.dob,
      businessDescription: clients.businessDescription,
      status: clients.status,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
    })
    .from(clients)
    .leftJoin(accounts, eq(clients.accountId, accounts.id))
    .where(
      and(
        eq(clients.id, clientId),
        eq(clients.organizationId, organizationId),
        isNull(clients.deletedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
};

export const findClientByEmailExcluding = async (
  organizationId: string,
  email: string,
  excludeId: string
): Promise<{ id: string } | null> => {
  const result = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        sql`LOWER(${clients.email}) = LOWER(${email})`,
        sql`${clients.id} != ${excludeId}`,
        isNull(clients.deletedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
};

export const findClientByGovIdExcluding = async (
  organizationId: string,
  govIdNumber: string,
  excludeId: string
): Promise<{ id: string } | null> => {
  const result = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        eq(clients.govIdNumber, govIdNumber),
        sql`${clients.id} != ${excludeId}`,
        isNull(clients.deletedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
};

// =============================================================================
// Commands
// =============================================================================

export interface CreateClientParams {
  organizationId: string;
  clientId: string;
  accountId: string;
  clientType: string;
  name: string;
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
}

export interface CreateClientResult {
  id: string;
  organizationId: string;
  clientId: string;
  accountId: string;
  clientType: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  govIdType: string | null;
  govIdNumber: string | null;
  phone: string | null;
  email: string | null;
  sex: string | null;
  dob: string | null;
  businessDescription: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export const createClient = async (params: CreateClientParams): Promise<CreateClientResult> => {
  const result = await db
    .insert(clients)
    .values({
      organizationId: params.organizationId,
      clientId: params.clientId,
      accountId: params.accountId,
      clientType: params.clientType,
      name: params.name,
      firstName: params.firstName ?? null,
      lastName: params.lastName ?? null,
      companyName: params.companyName ?? null,
      govIdType: params.govIdType ?? null,
      govIdNumber: params.govIdNumber ?? null,
      phone: params.phone ?? null,
      email: params.email ?? null,
      sex: params.sex ?? null,
      dob: params.dob ?? null,
      businessDescription: params.businessDescription ?? null,
      status: params.status ?? 'active',
    })
    .returning({
      id: clients.id,
      organizationId: clients.organizationId,
      clientId: clients.clientId,
      accountId: clients.accountId,
      clientType: clients.clientType,
      name: clients.name,
      firstName: clients.firstName,
      lastName: clients.lastName,
      companyName: clients.companyName,
      govIdType: clients.govIdType,
      govIdNumber: clients.govIdNumber,
      phone: clients.phone,
      email: clients.email,
      sex: clients.sex,
      dob: clients.dob,
      businessDescription: clients.businessDescription,
      status: clients.status,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
    });

  const client = result[0];
  if (!client) throw new AppError('Failed to create client', 500, 'DB_INSERT_FAILED');
  return client;
};

export interface UpdateClientParams {
  clientType?: string;
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
}

export interface UpdateClientResult {
  id: string;
  organizationId: string;
  clientId: string;
  accountId: string;
  clientType: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  govIdType: string | null;
  govIdNumber: string | null;
  phone: string | null;
  email: string | null;
  sex: string | null;
  dob: string | null;
  businessDescription: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export const updateClient = async (
  clientId: string,
  organizationId: string,
  params: UpdateClientParams
): Promise<UpdateClientResult> => {
  const result = await db
    .update(clients)
    .set({
      ...(params.clientType !== undefined && { clientType: params.clientType }),
      ...(params.name !== undefined && { name: params.name }),
      ...(params.firstName !== undefined && { firstName: params.firstName }),
      ...(params.lastName !== undefined && { lastName: params.lastName }),
      ...(params.companyName !== undefined && { companyName: params.companyName }),
      ...(params.govIdType !== undefined && { govIdType: params.govIdType }),
      ...(params.govIdNumber !== undefined && { govIdNumber: params.govIdNumber }),
      ...(params.phone !== undefined && { phone: params.phone }),
      ...(params.email !== undefined && { email: params.email }),
      ...(params.sex !== undefined && { sex: params.sex }),
      ...(params.dob !== undefined && { dob: params.dob }),
      ...(params.businessDescription !== undefined && { businessDescription: params.businessDescription }),
      ...(params.status !== undefined && { status: params.status }),
    })
    .where(
      and(
        eq(clients.id, clientId),
        eq(clients.organizationId, organizationId),
        isNull(clients.deletedAt)
      )
    )
    .returning({
      id: clients.id,
      organizationId: clients.organizationId,
      clientId: clients.clientId,
      accountId: clients.accountId,
      clientType: clients.clientType,
      name: clients.name,
      firstName: clients.firstName,
      lastName: clients.lastName,
      companyName: clients.companyName,
      govIdType: clients.govIdType,
      govIdNumber: clients.govIdNumber,
      phone: clients.phone,
      email: clients.email,
      sex: clients.sex,
      dob: clients.dob,
      businessDescription: clients.businessDescription,
      status: clients.status,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
    });

  const client = result[0];
  if (!client) throw new AppError('Failed to update client', 500, 'DB_UPDATE_FAILED');
  return client;
};

// =============================================================================
// List
// =============================================================================

export interface ListClientsParams {
  organizationId: string;
  page: number;
  limit: number;
  clientType?: string;
  status?: string;
  accountName?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  search?: string;
  sortBy: 'name' | 'createdAt' | 'clientId';
  sortOrder: 'asc' | 'desc';
}

export interface ListClientsResult {
  clients: ClientRow[];
  total: number;
}

export const listClients = async (params: ListClientsParams): Promise<ListClientsResult> => {
  const {
    organizationId,
    page,
    limit,
    clientType,
    status,
    accountName,
    firstName,
    lastName,
    companyName,
    search,
    sortBy,
    sortOrder,
  } = params;
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = [
    eq(clients.organizationId, organizationId),
    isNull(clients.deletedAt),
  ];

  // Exact filters
  if (clientType !== undefined) {
    conditions.push(eq(clients.clientType, clientType));
  }
  if (status !== undefined) {
    conditions.push(eq(clients.status, status));
  }

  // Name filters (ILIKE partial match)
  if (firstName !== undefined) {
    conditions.push(sql`${clients.firstName} ILIKE ${`%${firstName}%`}`);
  }
  if (lastName !== undefined) {
    conditions.push(sql`${clients.lastName} ILIKE ${`%${lastName}%`}`);
  }
  if (companyName !== undefined) {
    conditions.push(sql`${clients.companyName} ILIKE ${`%${companyName}%`}`);
  }

  // Account name filter (EXISTS subquery)
  if (accountName !== undefined) {
    const pattern = `%${accountName}%`;
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${accounts}
        WHERE ${accounts.id} = ${clients.accountId}
          AND ${accounts.organizationId} = ${organizationId}
          AND ${accounts.deletedAt} IS NULL
          AND ${accounts.name} ILIKE ${pattern}
      )`
    );
  }

  // Search across multiple fields
  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      sql`(
        ${clients.clientId} ILIKE ${searchPattern} OR
        ${clients.name} ILIKE ${searchPattern} OR
        ${clients.email} ILIKE ${searchPattern} OR
        ${clients.phone} ILIKE ${searchPattern} OR
        ${clients.govIdNumber} ILIKE ${searchPattern}
      )`
    );
  }

  const whereClause = and(...conditions);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  // Get paginated results
  const sortColumn =
    sortBy === 'name'
      ? clients.name
      : sortBy === 'clientId'
        ? clients.clientId
        : clients.createdAt;
  const orderDirection = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const result = await db
    .select({
      id: clients.id,
      organizationId: clients.organizationId,
      clientId: clients.clientId,
      accountId: clients.accountId,
      accountName: accounts.name,
      clientType: clients.clientType,
      name: clients.name,
      firstName: clients.firstName,
      lastName: clients.lastName,
      companyName: clients.companyName,
      govIdType: clients.govIdType,
      govIdNumber: clients.govIdNumber,
      phone: clients.phone,
      email: clients.email,
      sex: clients.sex,
      dob: clients.dob,
      businessDescription: clients.businessDescription,
      status: clients.status,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
    })
    .from(clients)
    .leftJoin(accounts, eq(clients.accountId, accounts.id))
    .where(whereClause)
    .orderBy(orderDirection, asc(clients.id))
    .limit(limit)
    .offset(offset);

  return { clients: result, total };
};

// =============================================================================
// Delete
// =============================================================================

export const hasClientRelatedData = (
  clientId: string,
  organizationId: string
): Promise<boolean> => {
  // No downstream entities yet - return false
  // When policies/claims are added, check them here
  void clientId;
  void organizationId;
  return Promise.resolve(false);
};

export const softDeleteClient = async (
  clientId: string,
  organizationId: string
): Promise<void> => {
  await db
    .update(clients)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(clients.id, clientId),
        eq(clients.organizationId, organizationId),
        isNull(clients.deletedAt)
      )
    );
};
