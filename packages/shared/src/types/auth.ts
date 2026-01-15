export interface AuthUser {
  id: string;
  email: string;
  profile: {
    firstName: string;
    lastName: string;
    phone: string | null;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  role: {
    id: string;
    name: string;
  };
}

export interface LoginResponse {
  user: AuthUser;
  permissions: string[];
}

export interface UpdateProfileResponse {
  profile: {
    firstName: string;
    lastName: string;
    phone: string | null;
  };
}

export interface InvitationListItem {
  id: string;
  email: string;
  role: {
    id: string;
    name: string;
  };
  invitedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  expiresAt: string;
  createdAt: string;
}

export interface ListInvitationsResponse {
  invitations: InvitationListItem[];
}

export interface CreateInvitationResponse {
  id: string;
  email: string;
  role: {
    id: string;
    name: string;
  };
  expiresAt: string;
}

// =============================================================================
// Sessions
// =============================================================================

export interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface ListSessionsResponse {
  sessions: Session[];
}

export interface RevokeAllSessionsResponse {
  revokedCount: number;
}

// =============================================================================
// Registration
// =============================================================================

export interface ResendVerificationResponse {
  sent: boolean;
  alreadyVerified: boolean;
  message: string;
}
