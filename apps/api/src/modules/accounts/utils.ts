import type { Account } from '@crm/shared';
import type { AccountRow } from './repository.js';

export const mapAccount = (row: AccountRow): Account => ({
  id: row.id,
  accountId: row.accountId,
  agentId: row.agentId,
  name: row.name,
  status: row.status as Account['status'],
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
