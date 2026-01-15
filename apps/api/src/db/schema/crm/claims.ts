import {
  baseColumns,
  pgTable,
  uuid,
  timestamp,
  varchar,
  text,
  decimal,
  index,
} from '../base.js';
import { organizations } from '../core.js';
import { policies } from './policies.js';

// Health Claims
export const healthClaims = pgTable(
  'health_claims',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policies.id),
    claimId: varchar('claim_id', { length: 100 }).notNull(),
    claimType: varchar('claim_type', { length: 20 }).notNull(),
    relatedClaimId: uuid('related_claim_id'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    attentionType: varchar('attention_type', { length: 50 }),
    patientName: varchar('patient_name', { length: 255 }).notNull(),
    diagnosis: text('diagnosis'),
    amountSubmitted: decimal('amount_submitted', { precision: 12, scale: 2 }).notNull(),
    amountApproved: decimal('amount_approved', { precision: 12, scale: 2 }),
    incidentDate: timestamp('incident_date', { withTimezone: true }),
    submittedDate: timestamp('submitted_date', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('health_claims_organization_id_idx').on(table.organizationId),
    index('health_claims_policy_id_idx').on(table.policyId),
    index('health_claims_claim_type_idx').on(table.claimType),
    index('health_claims_related_claim_id_idx').on(table.relatedClaimId),
    index('health_claims_status_idx').on(table.status),
    index('health_claims_submitted_date_idx').on(table.submittedDate),
  ]
);

// PC Claims (Property & Casualty)
export const pcClaims = pgTable(
  'pc_claims',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policies.id),
    claimId: varchar('claim_id', { length: 100 }).notNull(),
    insurerClaimNumber: varchar('insurer_claim_number', { length: 100 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    amountSubmitted: decimal('amount_submitted', { precision: 12, scale: 2 }).notNull(),
    amountApproved: decimal('amount_approved', { precision: 12, scale: 2 }),
    submittedDate: timestamp('submitted_date', { withTimezone: true }).notNull(),
    incidentDate: timestamp('incident_date', { withTimezone: true }),
    incidentDescription: text('incident_description'),
  },
  (table) => [
    index('pc_claims_organization_id_idx').on(table.organizationId),
    index('pc_claims_policy_id_idx').on(table.policyId),
    index('pc_claims_status_idx').on(table.status),
    index('pc_claims_submitted_date_idx').on(table.submittedDate),
  ]
);
