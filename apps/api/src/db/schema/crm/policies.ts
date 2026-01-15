import {
  baseColumns,
  pgTable,
  uuid,
  timestamp,
  varchar,
  text,
  boolean,
  decimal,
  index,
} from '../base.js';
import { organizations } from '../core.js';
import { insuranceTypes, products } from './insurers.js';
import { agents, clients } from './clients.js';

// Policies
export const policies = pgTable(
  'policies',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    insuranceTypeId: uuid('insurance_type_id')
      .notNull()
      .references(() => insuranceTypes.id),
    renewedFromId: uuid('renewed_from_id'),
    policyNumber: varchar('policy_number', { length: 100 }),
    businessType: varchar('business_type', { length: 20 }).notNull(),
    commercialUnit: varchar('commercial_unit', { length: 100 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    initialEffectiveDate: timestamp('initial_effective_date', { withTimezone: true }),
    effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    paymentPeriodicity: varchar('payment_periodicity', { length: 20 }),
    irregularCommission: boolean('irregular_commission').notNull().default(false),
    documentationComplete: boolean('documentation_complete').notNull().default(false),
  },
  (table) => [
    index('policies_organization_id_idx').on(table.organizationId),
    index('policies_client_id_idx').on(table.clientId),
    index('policies_agent_id_idx').on(table.agentId),
    index('policies_product_id_idx').on(table.productId),
    index('policies_insurance_type_id_idx').on(table.insuranceTypeId),
    index('policies_renewed_from_id_idx').on(table.renewedFromId),
    index('policies_status_idx').on(table.status),
    index('policies_effective_date_idx').on(table.effectiveDate),
    index('policies_end_date_idx').on(table.endDate),
  ]
);

// Policy Movements
export const policyMovements = pgTable(
  'policy_movements',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policies.id),
    movementType: varchar('movement_type', { length: 20 }).notNull(),
    insurerMovementId: varchar('insurer_movement_id', { length: 100 }),
    effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }),
    netPremium: decimal('net_premium', { precision: 12, scale: 2 }),
    grossPremium: decimal('gross_premium', { precision: 12, scale: 2 }),
    firstPayment: decimal('first_payment', { precision: 12, scale: 2 }),
    invoiceNumber: varchar('invoice_number', { length: 100 }),
    invoiceDate: timestamp('invoice_date', { withTimezone: true }),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (table) => [
    index('policy_movements_organization_id_idx').on(table.organizationId),
    index('policy_movements_policy_id_idx').on(table.policyId),
    index('policy_movements_movement_type_idx').on(table.movementType),
    index('policy_movements_effective_date_idx').on(table.effectiveDate),
    index('policy_movements_status_idx').on(table.status),
  ]
);

// Payments
export const payments = pgTable(
  'payments',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    policyMovementId: uuid('policy_movement_id')
      .notNull()
      .references(() => policyMovements.id),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
    paymentMethod: varchar('payment_method', { length: 50 }),
    reference: varchar('reference', { length: 100 }),
    notes: text('notes'),
    status: varchar('status', { length: 20 }).notNull().default('completed'),
  },
  (table) => [
    index('payments_organization_id_idx').on(table.organizationId),
    index('payments_policy_movement_id_idx').on(table.policyMovementId),
    index('payments_payment_date_idx').on(table.paymentDate),
    index('payments_status_idx').on(table.status),
  ]
);
