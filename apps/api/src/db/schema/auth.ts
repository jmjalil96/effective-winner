import {
  pgTable,
  uuid,
  timestamp,
  varchar,
  text,
  index,
  jsonb,
  foreignKey,
  uuidv7,
} from './base.js';
import { organizations, users, roles } from './core.js';

// Sessions (database-backed)
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // Hashed session ID - raw sid lives only in httpOnly cookie
    sidHash: varchar('sid_hash', { length: 64 }).notNull().unique(),
    userId: uuid('user_id').notNull(),
    // Denormalized for efficient org-level queries
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Express-session payload
    data: jsonb('data').notNull().$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Security context at creation
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).notNull().defaultNow(),
    // Explicit revocation (null = active, timestamp = revoked)
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_organization_id_idx').on(table.organizationId),
    index('sessions_expires_at_idx').on(table.expiresAt),
    index('sessions_revoked_at_idx').on(table.revokedAt),
    // Composite FK: user must be from same organization
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [users.organizationId, users.id],
      name: 'sessions_user_same_org_fk',
    }).onDelete('cascade'),
  ]
);

// Password Reset Tokens
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('password_reset_tokens_user_id_idx').on(table.userId),
    index('password_reset_tokens_token_hash_idx').on(table.tokenHash),
  ]
);

// Email Verification Tokens
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('email_verification_tokens_user_id_idx').on(table.userId),
    index('email_verification_tokens_token_hash_idx').on(table.tokenHash),
  ]
);

// Invitations
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    roleId: uuid('role_id').notNull(),
    invitedById: uuid('invited_by_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('invitations_organization_id_idx').on(table.organizationId),
    index('invitations_email_idx').on(table.email),
    index('invitations_token_hash_idx').on(table.tokenHash),
    // Composite FK: role must be from same organization
    foreignKey({
      columns: [table.organizationId, table.roleId],
      foreignColumns: [roles.organizationId, roles.id],
      name: 'invitations_role_same_org_fk',
    }),
    // Composite FK: inviter must be from same organization
    foreignKey({
      columns: [table.organizationId, table.invitedById],
      foreignColumns: [users.organizationId, users.id],
      name: 'invitations_invited_by_same_org_fk',
    }),
  ]
);
