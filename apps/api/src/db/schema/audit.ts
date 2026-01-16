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
import { organizations, users } from './core.js';

// Audit Logs
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    actorId: uuid('actor_id'),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }),
    entityId: uuid('entity_id'),
    changes: jsonb('changes'),
    metadata: jsonb('metadata'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    requestId: varchar('request_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_organization_id_idx').on(table.organizationId),
    index('audit_logs_actor_id_idx').on(table.actorId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('audit_logs_created_at_idx').on(table.createdAt),
    // Composite FK: actor must be from same organization
    foreignKey({
      columns: [table.organizationId, table.actorId],
      foreignColumns: [users.organizationId, users.id],
      name: 'audit_logs_actor_same_org_fk',
    }).onDelete('set null'),
  ]
);
