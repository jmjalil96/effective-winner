import type { AccountStatus } from '../constants/accounts.js';

// =============================================================================
// Account
// =============================================================================

export interface Account {
  id: string;
  accountId: string;
  agentId: string;
  name: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Responses
// =============================================================================

export interface CreateAccountResponse {
  account: Account;
}

export interface GetAccountResponse {
  account: Account;
}

export interface UpdateAccountResponse {
  account: Account;
}

export interface ListAccountsResponse {
  accounts: Account[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}
