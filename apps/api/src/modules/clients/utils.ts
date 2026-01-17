import type { Client, CreateClientInput } from '@crm/shared';
import type { ClientRow } from './repository.js';

export const normalizeName = (name: string): string => name.replace(/\s+/g, ' ').trim();

export const computeDisplayName = (input: CreateClientInput): string => {
  if (input.clientType === 'individual') {
    return normalizeName(`${input.firstName} ${input.lastName}`);
  }
  return normalizeName(input.companyName);
};

const INDIVIDUAL_GOV_ID_TYPES: readonly string[] = ['ruc_individual', 'cedula', 'pasaporte'];
const BUSINESS_GOV_ID_TYPES: readonly string[] = ['ruc_empresa'];

export const isValidGovIdTypeForClientType = (
  govIdType: string | null | undefined,
  clientType: 'individual' | 'business'
): boolean => {
  if (govIdType === null || govIdType === undefined) return true;
  if (clientType === 'individual') {
    return INDIVIDUAL_GOV_ID_TYPES.includes(govIdType);
  }
  return BUSINESS_GOV_ID_TYPES.includes(govIdType);
};

export const mapClient = (row: ClientRow): Client => ({
  id: row.id,
  clientId: row.clientId,
  account: {
    id: row.accountId,
    name: row.accountName ?? 'Unknown Account',
  },
  clientType: row.clientType as Client['clientType'],
  name: row.name,
  firstName: row.firstName,
  lastName: row.lastName,
  companyName: row.companyName,
  govIdType: row.govIdType as Client['govIdType'],
  govIdNumber: row.govIdNumber,
  phone: row.phone,
  email: row.email,
  sex: row.sex as Client['sex'],
  dob: row.dob,
  businessDescription: row.businessDescription,
  status: row.status as Client['status'],
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
