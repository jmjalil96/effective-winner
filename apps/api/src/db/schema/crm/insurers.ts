import {
  baseColumns,
  pgTable,
  uuid,
  timestamp,
  varchar,
  text,
  index,
  unique,
  foreignKey,
  uuidv7,
} from '../base.js';
import { organizations } from '../core.js';

// Insurance Types (global, like permissions)
export const insuranceTypes = pgTable('insurance_types', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  typeId: varchar('type_id', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  area: varchar('area', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Insurers
export const insurers = pgTable(
  'insurers',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    govId: varchar('gov_id', { length: 20 }),
    contractNumber: varchar('contract_number', { length: 100 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (table) => [
    index('insurers_organization_id_idx').on(table.organizationId),
    index('insurers_status_idx').on(table.status),
    // Composite unique for tenant-isolated FK references
    unique('insurers_org_id_key').on(table.organizationId, table.id),
  ]
);

// Insurer Contacts
export const insurerContacts = pgTable(
  'insurer_contacts',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    insurerId: uuid('insurer_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    role: varchar('role', { length: 50 }),
  },
  (table) => [
    index('insurer_contacts_organization_id_idx').on(table.organizationId),
    index('insurer_contacts_insurer_id_idx').on(table.insurerId),
    // Composite FK: insurer must be from same organization
    foreignKey({
      columns: [table.organizationId, table.insurerId],
      foreignColumns: [insurers.organizationId, insurers.id],
      name: 'insurer_contacts_insurer_same_org_fk',
    }),
  ]
);

// Products
export const products = pgTable(
  'products',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    insurerId: uuid('insurer_id').notNull(),
    insuranceTypeId: uuid('insurance_type_id')
      .notNull()
      .references(() => insuranceTypes.id),
    name: varchar('name', { length: 255 }).notNull(),
    nbCommission: varchar('nb_commission', { length: 10 }),
    renewalCommission: varchar('renewal_commission', { length: 10 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (table) => [
    index('products_organization_id_idx').on(table.organizationId),
    index('products_insurer_id_idx').on(table.insurerId),
    index('products_insurance_type_id_idx').on(table.insuranceTypeId),
    index('products_status_idx').on(table.status),
    // Composite unique for tenant-isolated FK references
    unique('products_org_id_key').on(table.organizationId, table.id),
    // Composite FK: insurer must be from same organization
    foreignKey({
      columns: [table.organizationId, table.insurerId],
      foreignColumns: [insurers.organizationId, insurers.id],
      name: 'products_insurer_same_org_fk',
    }),
  ]
);
