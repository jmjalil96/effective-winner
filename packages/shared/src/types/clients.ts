import type { ClientType, ClientStatus, ClientGovIdType, Sex } from '../constants/clients.js';

// =============================================================================
// Related Entity Summaries
// =============================================================================

export interface AccountSummary {
  id: string;
  name: string;
}

// =============================================================================
// Client
// =============================================================================

export interface Client {
  id: string;
  clientId: string;
  account: AccountSummary;
  clientType: ClientType;
  name: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  govIdType: ClientGovIdType | null;
  govIdNumber: string | null;
  phone: string | null;
  email: string | null;
  sex: Sex | null;
  dob: string | null;
  businessDescription: string | null;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Responses
// =============================================================================

export interface CreateClientResponse {
  client: Client;
}

export interface GetClientResponse {
  client: Client;
}

export interface UpdateClientResponse {
  client: Client;
}

export interface ListClientsResponse {
  clients: Client[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}
