import { eq, and, isNull, sql, asc, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { agents, idCounters } from '../../db/schema/index.js';
import { AppError } from '../../errors/index.js';

// =============================================================================
// Interfaces
// =============================================================================

export interface AgentRow {
  id: string;
  organizationId: string;
  agentId: string;
  firstName: string;
  lastName: string;
  govIdType: string | null;
  govIdNumber: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
  status: string;
  isHouseAgent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// ID Generation
// =============================================================================

export const getNextAgentId = async (organizationId: string): Promise<string> => {
  const result = await db
    .insert(idCounters)
    .values({
      organizationId,
      entityType: 'agent',
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
  return `AGT-${String(value).padStart(4, '0')}`;
};

// =============================================================================
// Queries
// =============================================================================

export const findHouseAgentByOrganization = async (
  organizationId: string
): Promise<AgentRow | null> => {
  const result = await db
    .select({
      id: agents.id,
      organizationId: agents.organizationId,
      agentId: agents.agentId,
      firstName: agents.firstName,
      lastName: agents.lastName,
      govIdType: agents.govIdType,
      govIdNumber: agents.govIdNumber,
      email: agents.email,
      phone: agents.phone,
      dob: agents.dob,
      status: agents.status,
      isHouseAgent: agents.isHouseAgent,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(
      and(
        eq(agents.organizationId, organizationId),
        eq(agents.isHouseAgent, true),
        isNull(agents.deletedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
};

export const findAgentByEmail = async (
  organizationId: string,
  email: string
): Promise<AgentRow | null> => {
  const result = await db
    .select({
      id: agents.id,
      organizationId: agents.organizationId,
      agentId: agents.agentId,
      firstName: agents.firstName,
      lastName: agents.lastName,
      govIdType: agents.govIdType,
      govIdNumber: agents.govIdNumber,
      email: agents.email,
      phone: agents.phone,
      dob: agents.dob,
      status: agents.status,
      isHouseAgent: agents.isHouseAgent,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(
      and(
        eq(agents.organizationId, organizationId),
        sql`LOWER(${agents.email}) = LOWER(${email})`,
        isNull(agents.deletedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
};

export const findAgentById = async (
  agentId: string,
  organizationId: string
): Promise<AgentRow | null> => {
  const result = await db
    .select({
      id: agents.id,
      organizationId: agents.organizationId,
      agentId: agents.agentId,
      firstName: agents.firstName,
      lastName: agents.lastName,
      govIdType: agents.govIdType,
      govIdNumber: agents.govIdNumber,
      email: agents.email,
      phone: agents.phone,
      dob: agents.dob,
      status: agents.status,
      isHouseAgent: agents.isHouseAgent,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
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

// =============================================================================
// Commands
// =============================================================================

export interface CreateAgentParams {
  organizationId: string;
  agentId: string;
  firstName: string;
  lastName: string;
  govIdType?: string;
  govIdNumber?: string;
  email?: string;
  phone?: string;
  dob?: string;
  isHouseAgent?: boolean;
}

export const createAgent = async (params: CreateAgentParams): Promise<AgentRow> => {
  const result = await db
    .insert(agents)
    .values({
      organizationId: params.organizationId,
      agentId: params.agentId,
      firstName: params.firstName,
      lastName: params.lastName,
      govIdType: params.govIdType,
      govIdNumber: params.govIdNumber,
      email: params.email,
      phone: params.phone,
      dob: params.dob,
      isHouseAgent: params.isHouseAgent ?? false,
    })
    .returning({
      id: agents.id,
      organizationId: agents.organizationId,
      agentId: agents.agentId,
      firstName: agents.firstName,
      lastName: agents.lastName,
      govIdType: agents.govIdType,
      govIdNumber: agents.govIdNumber,
      email: agents.email,
      phone: agents.phone,
      dob: agents.dob,
      status: agents.status,
      isHouseAgent: agents.isHouseAgent,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    });

  const agent = result[0];
  if (!agent) throw new AppError('Failed to create agent', 500, 'DB_INSERT_FAILED');
  return agent;
};

export interface UpdateAgentParams {
  firstName?: string;
  lastName?: string;
  govIdType?: string | null;
  govIdNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  dob?: string | null;
  status?: string;
  isHouseAgent?: boolean;
}

export const updateAgent = async (
  agentId: string,
  organizationId: string,
  params: UpdateAgentParams
): Promise<AgentRow> => {
  const result = await db
    .update(agents)
    .set({
      ...(params.firstName !== undefined && { firstName: params.firstName }),
      ...(params.lastName !== undefined && { lastName: params.lastName }),
      ...(params.govIdType !== undefined && { govIdType: params.govIdType }),
      ...(params.govIdNumber !== undefined && { govIdNumber: params.govIdNumber }),
      ...(params.email !== undefined && { email: params.email }),
      ...(params.phone !== undefined && { phone: params.phone }),
      ...(params.dob !== undefined && { dob: params.dob }),
      ...(params.status !== undefined && { status: params.status }),
      ...(params.isHouseAgent !== undefined && { isHouseAgent: params.isHouseAgent }),
    })
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.organizationId, organizationId),
        isNull(agents.deletedAt)
      )
    )
    .returning({
      id: agents.id,
      organizationId: agents.organizationId,
      agentId: agents.agentId,
      firstName: agents.firstName,
      lastName: agents.lastName,
      govIdType: agents.govIdType,
      govIdNumber: agents.govIdNumber,
      email: agents.email,
      phone: agents.phone,
      dob: agents.dob,
      status: agents.status,
      isHouseAgent: agents.isHouseAgent,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    });

  const agent = result[0];
  if (!agent) throw new AppError('Failed to update agent', 500, 'DB_UPDATE_FAILED');
  return agent;
};

// =============================================================================
// List
// =============================================================================

export interface ListAgentsParams {
  organizationId: string;
  page: number;
  limit: number;
  status?: string;
  isHouseAgent?: boolean;
  search?: string;
  sortBy: 'status' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

export interface ListAgentsResult {
  agents: AgentRow[];
  total: number;
}

export const listAgents = async (params: ListAgentsParams): Promise<ListAgentsResult> => {
  const { organizationId, page, limit, status, isHouseAgent, search, sortBy, sortOrder } = params;
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = [
    eq(agents.organizationId, organizationId),
    isNull(agents.deletedAt),
  ];

  if (status !== undefined) {
    conditions.push(eq(agents.status, status));
  }

  if (isHouseAgent !== undefined) {
    conditions.push(eq(agents.isHouseAgent, isHouseAgent));
  }

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      sql`(${agents.agentId} ILIKE ${searchPattern} OR ${agents.firstName} ILIKE ${searchPattern} OR ${agents.lastName} ILIKE ${searchPattern} OR ${agents.email} ILIKE ${searchPattern})`
    );
  }

  const whereClause = and(...conditions);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  // Get paginated results
  const sortColumn = sortBy === 'status' ? agents.status : agents.createdAt;
  const orderDirection = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const result = await db
    .select({
      id: agents.id,
      organizationId: agents.organizationId,
      agentId: agents.agentId,
      firstName: agents.firstName,
      lastName: agents.lastName,
      govIdType: agents.govIdType,
      govIdNumber: agents.govIdNumber,
      email: agents.email,
      phone: agents.phone,
      dob: agents.dob,
      status: agents.status,
      isHouseAgent: agents.isHouseAgent,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(whereClause)
    .orderBy(orderDirection, asc(agents.id))
    .limit(limit)
    .offset(offset);

  return { agents: result, total };
};

// =============================================================================
// Delete
// =============================================================================

export const hasAgentRelatedData = async (
  agentId: string,
  organizationId: string
): Promise<boolean> => {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM policies
      WHERE agent_id = ${agentId}
        AND organization_id = ${organizationId}
        AND deleted_at IS NULL
      UNION ALL
      SELECT 1 FROM accounts
      WHERE agent_id = ${agentId}
        AND organization_id = ${organizationId}
        AND deleted_at IS NULL
      UNION ALL
      SELECT 1 FROM agent_statements
      WHERE agent_id = ${agentId}
        AND organization_id = ${organizationId}
        AND deleted_at IS NULL
      UNION ALL
      SELECT 1 FROM agent_commissions
      WHERE agent_id = ${agentId}
        AND organization_id = ${organizationId}
        AND deleted_at IS NULL
      UNION ALL
      SELECT 1 FROM commission_rates
      WHERE primary_agent_id = ${agentId}
        AND organization_id = ${organizationId}
        AND deleted_at IS NULL
      UNION ALL
      SELECT 1 FROM commission_rate_splits
      WHERE beneficiary_agent_id = ${agentId}
        AND organization_id = ${organizationId}
        AND deleted_at IS NULL
      LIMIT 1
    ) AS has_data
  `);
  return result[0]?.['has_data'] === true;
};

export const softDeleteAgent = async (
  agentId: string,
  organizationId: string
): Promise<void> => {
  await db
    .update(agents)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.organizationId, organizationId),
        isNull(agents.deletedAt)
      )
    );
};
