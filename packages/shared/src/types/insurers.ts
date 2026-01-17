import type { InsurerStatus } from '../constants/insurers.js';

// =============================================================================
// Insurer
// =============================================================================

export interface Insurer {
  id: string;
  name: string;
  govId: string | null;
  contractNumber: string | null;
  email: string | null;
  phone: string | null;
  status: InsurerStatus;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Responses
// =============================================================================

export interface CreateInsurerResponse {
  insurer: Insurer;
}

export interface GetInsurerResponse {
  insurer: Insurer;
}

export interface UpdateInsurerResponse {
  insurer: Insurer;
}

export interface ListInsurersResponse {
  insurers: Insurer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}
