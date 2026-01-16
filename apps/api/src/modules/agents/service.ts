import { createChildLogger } from '../../config/logger.js';
import { ConflictError, NotFoundError } from '../../errors/index.js';
import { logWithContext, AUDIT_ACTIONS, toAuditContext } from '../../lib/services/index.js';
import type {
  CreateAgentInput,
  UpdateAgentInput,
  ListAgentsQuery,
  Agent,
  ListAgentsResponse,
} from '@crm/shared';
import {
  getNextAgentId,
  findHouseAgentByOrganization,
  findAgentByEmail,
  findAgentById,
  createAgent,
  updateAgent,
  listAgents,
  hasAgentRelatedData,
  softDeleteAgent,
} from './repository.js';
import { AGENT_ERRORS } from './constants.js';
import { mapAgent } from './utils.js';

const serviceLogger = createChildLogger({ module: 'agents' });

// =============================================================================
// Context Interfaces
// =============================================================================

export interface AgentContext {
  organizationId: string;
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

// =============================================================================
// Create Agent
// =============================================================================

export const createAgentService = async (
  input: CreateAgentInput,
  ctx: AgentContext
): Promise<Agent> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Validate house agent uniqueness (only one per org)
  if (input.isHouseAgent) {
    const existingHouseAgent = await findHouseAgentByOrganization(ctx.organizationId);
    if (existingHouseAgent) {
      throw new ConflictError(AGENT_ERRORS.HOUSE_AGENT_EXISTS);
    }
  }

  // 2. Check email uniqueness within org (if provided)
  if (input.email) {
    const existingAgent = await findAgentByEmail(ctx.organizationId, input.email);
    if (existingAgent) {
      throw new ConflictError(AGENT_ERRORS.EMAIL_EXISTS);
    }
  }

  // 3. Generate auto-incremented agentId (atomic)
  const agentId = await getNextAgentId(ctx.organizationId);

  // 4. Create agent
  const agent = await createAgent({
    organizationId: ctx.organizationId,
    agentId,
    firstName: input.firstName,
    lastName: input.lastName,
    govIdType: input.govIdType,
    govIdNumber: input.govIdNumber,
    email: input.email,
    phone: input.phone,
    dob: input.dob,
    isHouseAgent: input.isHouseAgent,
  });

  // 5. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.AGENT_CREATE,
    entityType: 'agent',
    entityId: agent.id,
    metadata: {
      agentId: agent.agentId,
      firstName: input.firstName,
      lastName: input.lastName,
      isHouseAgent: input.isHouseAgent,
    },
  });

  serviceLogger.info(
    { agentId: agent.agentId, requestId: ctx.requestId },
    'Agent created'
  );

  return mapAgent(agent);
};

// =============================================================================
// Get Agent
// =============================================================================

export const getAgentService = async (
  agentId: string,
  ctx: AgentContext
): Promise<Agent> => {
  const agent = await findAgentById(agentId, ctx.organizationId);

  if (!agent) {
    throw new NotFoundError(AGENT_ERRORS.AGENT_NOT_FOUND);
  }

  return mapAgent(agent);
};

// =============================================================================
// Update Agent
// =============================================================================

export const updateAgentService = async (
  agentId: string,
  input: UpdateAgentInput,
  ctx: AgentContext
): Promise<Agent> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find existing agent
  const existing = await findAgentById(agentId, ctx.organizationId);
  if (!existing) {
    throw new NotFoundError(AGENT_ERRORS.AGENT_NOT_FOUND);
  }

  // 2. Check isHouseAgent uniqueness (if changing to true)
  if (input.isHouseAgent === true && !existing.isHouseAgent) {
    const existingHouse = await findHouseAgentByOrganization(ctx.organizationId);
    if (existingHouse) {
      throw new ConflictError(AGENT_ERRORS.HOUSE_AGENT_EXISTS);
    }
  }

  // 3. Check email uniqueness (if changing to a different email)
  if (input.email && input.email.toLowerCase() !== existing.email?.toLowerCase()) {
    const emailExists = await findAgentByEmail(ctx.organizationId, input.email);
    if (emailExists) {
      throw new ConflictError(AGENT_ERRORS.EMAIL_EXISTS);
    }
  }

  // 4. Check if anything to update (no-op handling)
  const hasChanges =
    input.firstName !== undefined ||
    input.lastName !== undefined ||
    input.govIdType !== undefined ||
    input.govIdNumber !== undefined ||
    input.email !== undefined ||
    input.phone !== undefined ||
    input.dob !== undefined ||
    input.status !== undefined ||
    input.isHouseAgent !== undefined;

  if (!hasChanges) {
    return mapAgent(existing);
  }

  // 5. Update
  const agent = await updateAgent(agentId, ctx.organizationId, input);

  // 6. Audit log with before/after
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.AGENT_UPDATE,
    entityType: 'agent',
    entityId: agentId,
    changes: {
      before: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        status: existing.status,
        isHouseAgent: existing.isHouseAgent,
      },
      after: {
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        status: agent.status,
        isHouseAgent: agent.isHouseAgent,
      },
    },
  });

  serviceLogger.info({ agentId: agent.agentId, requestId: ctx.requestId }, 'Agent updated');

  return mapAgent(agent);
};

// =============================================================================
// List Agents
// =============================================================================

export const listAgentsService = async (
  query: ListAgentsQuery,
  ctx: AgentContext
): Promise<ListAgentsResponse> => {
  const result = await listAgents({
    organizationId: ctx.organizationId,
    page: query.page,
    limit: query.limit,
    status: query.status,
    isHouseAgent: query.isHouseAgent,
    search: query.search,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });

  return {
    agents: result.agents.map(mapAgent),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
    },
  };
};

// =============================================================================
// Delete Agent
// =============================================================================

export const deleteAgentService = async (
  agentId: string,
  ctx: AgentContext
): Promise<void> => {
  const auditCtx = toAuditContext(ctx);

  // 1. Find agent
  const agent = await findAgentById(agentId, ctx.organizationId);
  if (!agent) {
    throw new NotFoundError(AGENT_ERRORS.AGENT_NOT_FOUND);
  }

  // 2. Check for related data
  const hasData = await hasAgentRelatedData(agentId, ctx.organizationId);
  if (hasData) {
    throw new ConflictError(AGENT_ERRORS.CANNOT_DELETE_WITH_DATA);
  }

  // 3. Soft delete
  await softDeleteAgent(agentId, ctx.organizationId);

  // 4. Audit log
  logWithContext(auditCtx, {
    action: AUDIT_ACTIONS.AGENT_DELETE,
    entityType: 'agent',
    entityId: agentId,
    metadata: {
      agentId: agent.agentId,
      firstName: agent.firstName,
      lastName: agent.lastName,
    },
  });

  serviceLogger.info(
    { agentId: agent.agentId, requestId: ctx.requestId },
    'Agent deleted'
  );
};
