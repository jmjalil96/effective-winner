import {
  baseColumns,
  pgTable,
  uuid,
  timestamp,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  index,
  unique,
} from '../base.js';
import { organizations } from '../core.js';
import { insurers, products } from './insurers.js';
import { agents } from './clients.js';
import { policies } from './policies.js';

// Commission Statements (from insurers, with broker invoice)
export const commissionStatements = pgTable(
  'commission_statements',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    insurerId: uuid('insurer_id')
      .notNull()
      .references(() => insurers.id),
    statementId: varchar('statement_id', { length: 100 }).notNull(),
    dateReceived: timestamp('date_received', { withTimezone: true }).notNull(),
    commercialUnit: varchar('commercial_unit', { length: 100 }),
    statementType: varchar('statement_type', { length: 20 }).notNull(),
    relatedStatementId: uuid('related_statement_id'),
    value: decimal('value', { precision: 12, scale: 2 }).notNull(),
    taxRate: decimal('tax_rate', { precision: 5, scale: 4 }),
    reconciliationStatus: varchar('reconciliation_status', { length: 20 }).notNull().default('pending'),
    invoiceNumber: varchar('invoice_number', { length: 100 }),
    invoiceDate: timestamp('invoice_date', { withTimezone: true }),
    invoiceStatus: varchar('invoice_status', { length: 20 }),
    paymentDate: timestamp('payment_date', { withTimezone: true }),
  },
  (table) => [
    index('commission_statements_organization_id_idx').on(table.organizationId),
    index('commission_statements_insurer_id_idx').on(table.insurerId),
    index('commission_statements_statement_type_idx').on(table.statementType),
    index('commission_statements_related_statement_id_idx').on(table.relatedStatementId),
    index('commission_statements_reconciliation_status_idx').on(table.reconciliationStatus),
    index('commission_statements_date_received_idx').on(table.dateReceived),
  ]
);

// Agent Statements (payouts to agents)
export const agentStatements = pgTable(
  'agent_statements',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    date: timestamp('date', { withTimezone: true }).notNull(),
    validationStatus: varchar('validation_status', { length: 20 }).notNull().default('pending'),
    sent: boolean('sent').notNull().default(false),
    totalCommission: decimal('total_commission', { precision: 12, scale: 2 }).notNull(),
    agentInvoice: varchar('agent_invoice', { length: 100 }),
    paymentStatus: varchar('payment_status', { length: 20 }).notNull().default('pending'),
    paymentDate: timestamp('payment_date', { withTimezone: true }),
  },
  (table) => [
    index('agent_statements_organization_id_idx').on(table.organizationId),
    index('agent_statements_agent_id_idx').on(table.agentId),
    index('agent_statements_date_idx').on(table.date),
    index('agent_statements_validation_status_idx').on(table.validationStatus),
    index('agent_statements_payment_status_idx').on(table.paymentStatus),
  ]
);

// Commission Rates (configuration for calculating splits)
export const commissionRates = pgTable(
  'commission_rates',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    primaryAgentId: uuid('primary_agent_id')
      .notNull()
      .references(() => agents.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    businessType: varchar('business_type', { length: 20 }).notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
  },
  (table) => [
    index('commission_rates_organization_id_idx').on(table.organizationId),
    index('commission_rates_primary_agent_id_idx').on(table.primaryAgentId),
    index('commission_rates_product_id_idx').on(table.productId),
    index('commission_rates_business_type_idx').on(table.businessType),
    index('commission_rates_effective_from_idx').on(table.effectiveFrom),
    unique('commission_rates_unique').on(
      table.organizationId,
      table.primaryAgentId,
      table.productId,
      table.businessType,
      table.effectiveFrom
    ),
  ]
);

// Commission Rate Splits (beneficiaries for each rate)
export const commissionRateSplits = pgTable(
  'commission_rate_splits',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    commissionRateId: uuid('commission_rate_id')
      .notNull()
      .references(() => commissionRates.id),
    beneficiaryAgentId: uuid('beneficiary_agent_id')
      .notNull()
      .references(() => agents.id),
    rate: decimal('rate', { precision: 5, scale: 4 }).notNull(),
    splitOrder: integer('split_order').notNull().default(1),
  },
  (table) => [
    index('commission_rate_splits_organization_id_idx').on(table.organizationId),
    index('commission_rate_splits_commission_rate_id_idx').on(table.commissionRateId),
    index('commission_rate_splits_beneficiary_agent_id_idx').on(table.beneficiaryAgentId),
    unique('commission_rate_splits_unique').on(table.commissionRateId, table.beneficiaryAgentId),
  ]
);

// Agent Commissions (line items within commission statements)
export const agentCommissions = pgTable(
  'agent_commissions',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    commissionStatementId: uuid('commission_statement_id')
      .notNull()
      .references(() => commissionStatements.id),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policies.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    agentStatementId: uuid('agent_statement_id').references(() => agentStatements.id),
    totalPremium: decimal('total_premium', { precision: 12, scale: 2 }),
    prorataPremium: decimal('prorata_premium', { precision: 12, scale: 2 }),
    commissionRate: decimal('commission_rate', { precision: 5, scale: 4 }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    commissionType: varchar('commission_type', { length: 20 }).notNull(),
    notes: text('notes'),
  },
  (table) => [
    index('agent_commissions_organization_id_idx').on(table.organizationId),
    index('agent_commissions_commission_statement_id_idx').on(table.commissionStatementId),
    index('agent_commissions_policy_id_idx').on(table.policyId),
    index('agent_commissions_agent_id_idx').on(table.agentId),
    index('agent_commissions_agent_statement_id_idx').on(table.agentStatementId),
    index('agent_commissions_commission_type_idx').on(table.commissionType),
  ]
);
