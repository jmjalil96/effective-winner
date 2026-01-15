import { primaryKey } from 'drizzle-orm/pg-core';
import {
  baseColumns,
  pgTable,
  uuid,
  timestamp,
  varchar,
  text,
  boolean,
  integer,
  index,
  unique,
  jsonb,
  uuidv7,
} from './base.js';

// Organizations (tenants)
export const organizations = pgTable('organizations', {
  ...baseColumns,
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  billingEmail: varchar('billing_email', { length: 255 }),
  settings: jsonb('settings'),
});

// Roles (per-org)
// Note: Unique constraint on (organization_id, name) is a partial index WHERE deleted_at IS NULL
// See migration 0006_fix_roles_unique_constraint.sql
export const roles = pgTable(
  'roles',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (table) => [index('roles_organization_id_idx').on(table.organizationId)]
);

// Users (auth only)
export const users = pgTable(
  'users',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    unique('users_email_unique').on(table.email),
    index('users_organization_id_idx').on(table.organizationId),
    index('users_role_id_idx').on(table.roleId),
  ]
);

// Profiles (user identity)
export const profiles = pgTable('profiles', {
  ...baseColumns,
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
});

// Permissions (global)
export const permissions = pgTable('permissions', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Role Permissions (junction)
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })]
);
