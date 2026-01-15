// Schema barrel - re-exports everything for wildcard import in db/index.ts

// Base utilities
export * from './base.js';

// Core tables (organizations, users, profiles, roles, permissions, rolePermissions)
export * from './core.js';

// Auth tables (sessions, passwordResetTokens, emailVerificationTokens, invitations)
export * from './auth.js';

// Audit tables (auditLogs)
export * from './audit.js';

// CRM tables (insurers, agents, clients, policies, commissions, claims, notes)
export * from './crm/index.js';

// All relation definitions
export * from './relations.js';

// All inferred types
export * from './types.js';
