import type { Agent } from '@crm/shared';
import type { AgentRow } from './repository.js';

export const mapAgent = (row: AgentRow): Agent => ({
  id: row.id,
  agentId: row.agentId,
  firstName: row.firstName,
  lastName: row.lastName,
  govIdType: row.govIdType as Agent['govIdType'],
  govIdNumber: row.govIdNumber,
  email: row.email,
  phone: row.phone,
  dob: row.dob,
  status: row.status as Agent['status'],
  isHouseAgent: row.isHouseAgent,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
