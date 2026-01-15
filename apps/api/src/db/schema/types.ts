// Core types
import {
  organizations,
  users,
  profiles,
  roles,
  permissions,
} from './core.js';

// Auth types
import {
  sessions,
  passwordResetTokens,
  emailVerificationTokens,
  invitations,
} from './auth.js';

// Audit types
import { auditLogs } from './audit.js';

// CRM types
import {
  insuranceTypes,
  insurers,
  insurerContacts,
  products,
  agents,
  accounts,
  clients,
  clientContacts,
  policies,
  policyMovements,
  payments,
  commissionStatements,
  agentStatements,
  commissionRates,
  commissionRateSplits,
  agentCommissions,
  healthClaims,
  pcClaims,
  notes,
} from './crm/index.js';

// Core Types
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;

// Auth Types
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// Audit Types
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// CRM Types - Insurers
export type InsuranceType = typeof insuranceTypes.$inferSelect;
export type NewInsuranceType = typeof insuranceTypes.$inferInsert;
export type Insurer = typeof insurers.$inferSelect;
export type NewInsurer = typeof insurers.$inferInsert;
export type InsurerContact = typeof insurerContacts.$inferSelect;
export type NewInsurerContact = typeof insurerContacts.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

// CRM Types - Clients
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type ClientContact = typeof clientContacts.$inferSelect;
export type NewClientContact = typeof clientContacts.$inferInsert;

// CRM Types - Policies
export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;
export type PolicyMovement = typeof policyMovements.$inferSelect;
export type NewPolicyMovement = typeof policyMovements.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// CRM Types - Commissions
export type CommissionStatement = typeof commissionStatements.$inferSelect;
export type NewCommissionStatement = typeof commissionStatements.$inferInsert;
export type AgentStatement = typeof agentStatements.$inferSelect;
export type NewAgentStatement = typeof agentStatements.$inferInsert;
export type CommissionRate = typeof commissionRates.$inferSelect;
export type NewCommissionRate = typeof commissionRates.$inferInsert;
export type CommissionRateSplit = typeof commissionRateSplits.$inferSelect;
export type NewCommissionRateSplit = typeof commissionRateSplits.$inferInsert;
export type AgentCommission = typeof agentCommissions.$inferSelect;
export type NewAgentCommission = typeof agentCommissions.$inferInsert;

// CRM Types - Claims
export type HealthClaim = typeof healthClaims.$inferSelect;
export type NewHealthClaim = typeof healthClaims.$inferInsert;
export type PcClaim = typeof pcClaims.$inferSelect;
export type NewPcClaim = typeof pcClaims.$inferInsert;

// CRM Types - Notes
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
