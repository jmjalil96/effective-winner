import {
  baseColumns,
  pgTable,
  uuid,
  timestamp,
  varchar,
  text,
  boolean,
  index,
  unique,
} from '../base.js';
import { organizations } from '../core.js';

// Agents
export const agents = pgTable(
  'agents',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    agentId: varchar('agent_id', { length: 50 }).notNull(),
    firstName: varchar('first_name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }).notNull(),
    govIdType: varchar('gov_id_type', { length: 20 }),
    govIdNumber: varchar('gov_id_number', { length: 20 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    dob: timestamp('dob', { withTimezone: true }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    isHouseAgent: boolean('is_house_agent').notNull().default(false),
  },
  (table) => [
    index('agents_organization_id_idx').on(table.organizationId),
    unique('agents_org_agent_id_unique').on(table.organizationId, table.agentId),
    index('agents_status_idx').on(table.status),
    index('agents_is_house_agent_idx').on(table.isHouseAgent),
  ]
);

// Accounts
export const accounts = pgTable(
  'accounts',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    name: varchar('name', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (table) => [
    index('accounts_organization_id_idx').on(table.organizationId),
    index('accounts_agent_id_idx').on(table.agentId),
    index('accounts_status_idx').on(table.status),
  ]
);

// Clients
export const clients = pgTable(
  'clients',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    clientType: varchar('client_type', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 255 }),
    lastName: varchar('last_name', { length: 255 }),
    govIdType: varchar('gov_id_type', { length: 20 }),
    govIdNumber: varchar('gov_id_number', { length: 20 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 255 }),
    sex: varchar('sex', { length: 10 }),
    dob: timestamp('dob', { withTimezone: true }),
    businessDescription: text('business_description'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
  },
  (table) => [
    index('clients_organization_id_idx').on(table.organizationId),
    index('clients_account_id_idx').on(table.accountId),
    index('clients_client_type_idx').on(table.clientType),
    index('clients_status_idx').on(table.status),
  ]
);

// Client Contacts
export const clientContacts = pgTable(
  'client_contacts',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    role: varchar('role', { length: 50 }),
  },
  (table) => [
    index('client_contacts_organization_id_idx').on(table.organizationId),
    index('client_contacts_client_id_idx').on(table.clientId),
  ]
);
