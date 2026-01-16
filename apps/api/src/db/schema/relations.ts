import { relations } from 'drizzle-orm';

// Core tables
import { organizations, users, profiles, roles, permissions, rolePermissions } from './core.js';

// Auth tables
import { sessions, passwordResetTokens, emailVerificationTokens, invitations } from './auth.js';

// Audit tables
import { auditLogs } from './audit.js';

// CRM tables
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

// Core Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  roles: many(roles),
  invitations: many(invitations),
  auditLogs: many(auditLogs),
  sessions: many(sessions),
  insurers: many(insurers),
  agents: many(agents),
  accounts: many(accounts),
  clients: many(clients),
  products: many(products),
  policies: many(policies),
  policyMovements: many(policyMovements),
  payments: many(payments),
  commissionStatements: many(commissionStatements),
  agentCommissions: many(agentCommissions),
  agentStatements: many(agentStatements),
  commissionRates: many(commissionRates),
  commissionRateSplits: many(commissionRateSplits),
  healthClaims: many(healthClaims),
  pcClaims: many(pcClaims),
  notes: many(notes),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [roles.organizationId],
    references: [organizations.id],
  }),
  users: many(users),
  rolePermissions: many(rolePermissions),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  profile: one(profiles),
  passwordResetTokens: many(passwordResetTokens),
  emailVerificationTokens: many(emailVerificationTokens),
  invitationsSent: many(invitations),
  auditLogs: many(auditLogs),
  sessions: many(sessions),
  notesCreated: many(notes),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

// Auth Relations
export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  role: one(roles, {
    fields: [invitations.roleId],
    references: [roles.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedById],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [sessions.organizationId],
    references: [organizations.id],
  }),
}));

// Audit Relations
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  actor: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
}));

// CRM Relations - Insurers
export const insuranceTypesRelations = relations(insuranceTypes, ({ many }) => ({
  products: many(products),
  policies: many(policies),
}));

export const insurersRelations = relations(insurers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [insurers.organizationId],
    references: [organizations.id],
  }),
  products: many(products),
  contacts: many(insurerContacts),
  commissionStatements: many(commissionStatements),
}));

export const insurerContactsRelations = relations(insurerContacts, ({ one }) => ({
  organization: one(organizations, {
    fields: [insurerContacts.organizationId],
    references: [organizations.id],
  }),
  insurer: one(insurers, {
    fields: [insurerContacts.insurerId],
    references: [insurers.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [products.organizationId],
    references: [organizations.id],
  }),
  insurer: one(insurers, {
    fields: [products.insurerId],
    references: [insurers.id],
  }),
  insuranceType: one(insuranceTypes, {
    fields: [products.insuranceTypeId],
    references: [insuranceTypes.id],
  }),
  policies: many(policies),
  commissionRates: many(commissionRates),
}));

// CRM Relations - Clients
export const agentsRelations = relations(agents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [agents.organizationId],
    references: [organizations.id],
  }),
  accounts: many(accounts),
  policies: many(policies),
  commissions: many(agentCommissions),
  statements: many(agentStatements),
  ratesAsPrimary: many(commissionRates),
  ratesAsBeneficiary: many(commissionRateSplits),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [accounts.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, {
    fields: [accounts.agentId],
    references: [agents.id],
  }),
  clients: many(clients),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [clients.organizationId],
    references: [organizations.id],
  }),
  account: one(accounts, {
    fields: [clients.accountId],
    references: [accounts.id],
  }),
  contacts: many(clientContacts),
  policies: many(policies),
}));

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  organization: one(organizations, {
    fields: [clientContacts.organizationId],
    references: [organizations.id],
  }),
  client: one(clients, {
    fields: [clientContacts.clientId],
    references: [clients.id],
  }),
}));

// CRM Relations - Policies
export const policiesRelations = relations(policies, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [policies.organizationId],
    references: [organizations.id],
  }),
  client: one(clients, {
    fields: [policies.clientId],
    references: [clients.id],
  }),
  agent: one(agents, {
    fields: [policies.agentId],
    references: [agents.id],
  }),
  product: one(products, {
    fields: [policies.productId],
    references: [products.id],
  }),
  insuranceType: one(insuranceTypes, {
    fields: [policies.insuranceTypeId],
    references: [insuranceTypes.id],
  }),
  renewedFrom: one(policies, {
    fields: [policies.renewedFromId],
    references: [policies.id],
  }),
  movements: many(policyMovements),
  commissions: many(agentCommissions),
  healthClaims: many(healthClaims),
  pcClaims: many(pcClaims),
}));

export const policyMovementsRelations = relations(policyMovements, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [policyMovements.organizationId],
    references: [organizations.id],
  }),
  policy: one(policies, {
    fields: [policyMovements.policyId],
    references: [policies.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  organization: one(organizations, {
    fields: [payments.organizationId],
    references: [organizations.id],
  }),
  policyMovement: one(policyMovements, {
    fields: [payments.policyMovementId],
    references: [policyMovements.id],
  }),
}));

// CRM Relations - Commissions
export const commissionStatementsRelations = relations(commissionStatements, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [commissionStatements.organizationId],
    references: [organizations.id],
  }),
  insurer: one(insurers, {
    fields: [commissionStatements.insurerId],
    references: [insurers.id],
  }),
  relatedStatement: one(commissionStatements, {
    fields: [commissionStatements.relatedStatementId],
    references: [commissionStatements.id],
  }),
  agentCommissions: many(agentCommissions),
}));

export const agentCommissionsRelations = relations(agentCommissions, ({ one }) => ({
  organization: one(organizations, {
    fields: [agentCommissions.organizationId],
    references: [organizations.id],
  }),
  commissionStatement: one(commissionStatements, {
    fields: [agentCommissions.commissionStatementId],
    references: [commissionStatements.id],
  }),
  policy: one(policies, {
    fields: [agentCommissions.policyId],
    references: [policies.id],
  }),
  agent: one(agents, {
    fields: [agentCommissions.agentId],
    references: [agents.id],
  }),
  agentStatement: one(agentStatements, {
    fields: [agentCommissions.agentStatementId],
    references: [agentStatements.id],
  }),
}));

export const agentStatementsRelations = relations(agentStatements, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [agentStatements.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, {
    fields: [agentStatements.agentId],
    references: [agents.id],
  }),
  commissions: many(agentCommissions),
}));

export const commissionRatesRelations = relations(commissionRates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [commissionRates.organizationId],
    references: [organizations.id],
  }),
  primaryAgent: one(agents, {
    fields: [commissionRates.primaryAgentId],
    references: [agents.id],
  }),
  product: one(products, {
    fields: [commissionRates.productId],
    references: [products.id],
  }),
  splits: many(commissionRateSplits),
}));

export const commissionRateSplitsRelations = relations(commissionRateSplits, ({ one }) => ({
  organization: one(organizations, {
    fields: [commissionRateSplits.organizationId],
    references: [organizations.id],
  }),
  commissionRate: one(commissionRates, {
    fields: [commissionRateSplits.commissionRateId],
    references: [commissionRates.id],
  }),
  beneficiaryAgent: one(agents, {
    fields: [commissionRateSplits.beneficiaryAgentId],
    references: [agents.id],
  }),
}));

// CRM Relations - Claims
export const healthClaimsRelations = relations(healthClaims, ({ one }) => ({
  organization: one(organizations, {
    fields: [healthClaims.organizationId],
    references: [organizations.id],
  }),
  policy: one(policies, {
    fields: [healthClaims.policyId],
    references: [policies.id],
  }),
  relatedClaim: one(healthClaims, {
    fields: [healthClaims.relatedClaimId],
    references: [healthClaims.id],
  }),
}));

export const pcClaimsRelations = relations(pcClaims, ({ one }) => ({
  organization: one(organizations, {
    fields: [pcClaims.organizationId],
    references: [organizations.id],
  }),
  policy: one(policies, {
    fields: [pcClaims.policyId],
    references: [policies.id],
  }),
}));

// CRM Relations - Notes
export const notesRelations = relations(notes, ({ one }) => ({
  organization: one(organizations, {
    fields: [notes.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [notes.createdById],
    references: [users.id],
  }),
  editedBy: one(users, {
    fields: [notes.editedById],
    references: [users.id],
  }),
}));
