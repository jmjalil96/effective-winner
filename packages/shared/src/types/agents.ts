import type { GovIdType, AgentStatus } from '../constants/agents.js';

// =============================================================================
// Agent
// =============================================================================

export interface Agent {
  id: string;
  agentId: string;
  firstName: string;
  lastName: string;
  govIdType: GovIdType | null;
  govIdNumber: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
  status: AgentStatus;
  isHouseAgent: boolean;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Responses
// =============================================================================

export interface CreateAgentResponse {
  agent: Agent;
}

export interface GetAgentResponse {
  agent: Agent;
}

export interface UpdateAgentResponse {
  agent: Agent;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ListAgentsResponse {
  agents: Agent[];
  pagination: PaginationMeta;
}
