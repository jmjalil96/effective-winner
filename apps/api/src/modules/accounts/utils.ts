import type { Account } from '@crm/shared';
import type { AccountRow } from './repository.js';

const formatAgentName = (firstName: string | null, lastName: string | null): string => {
  return `${firstName ?? ''} ${lastName ?? ''}`.trim() || 'Unknown Agent';
};

export const mapAccount = (row: AccountRow): Account => ({
  id: row.id,
  accountId: row.accountId,
  agent: {
    id: row.agentId,
    name: formatAgentName(row.agentFirstName, row.agentLastName),
  },
  name: row.name,
  status: row.status as Account['status'],
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
