import type { Insurer } from '@crm/shared';
import type { InsurerRow } from './repository.js';

export const mapInsurer = (row: InsurerRow): Insurer => ({
  id: row.id,
  name: row.name,
  govId: row.govId,
  contractNumber: row.contractNumber,
  email: row.email,
  phone: row.phone,
  status: row.status as Insurer['status'],
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
