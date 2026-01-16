import {
  baseColumns,
  pgTable,
  uuid,
  timestamp,
  varchar,
  text,
  boolean,
  index,
  foreignKey,
} from '../base.js';
import { organizations, users } from '../core.js';

// Notes (polymorphic, linked to any entity)
export const notes = pgTable(
  'notes',
  {
    ...baseColumns,
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    content: text('content').notNull(),
    isPinned: boolean('is_pinned').notNull().default(false),
    createdById: uuid('created_by_id').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    editedById: uuid('edited_by_id'),
  },
  (table) => [
    index('notes_organization_id_idx').on(table.organizationId),
    index('notes_entity_idx').on(table.entityType, table.entityId),
    index('notes_created_by_id_idx').on(table.createdById),
    index('notes_is_pinned_idx').on(table.isPinned),
    // Composite FK: creator must be from same organization
    foreignKey({
      columns: [table.organizationId, table.createdById],
      foreignColumns: [users.organizationId, users.id],
      name: 'notes_created_by_same_org_fk',
    }),
    // Composite FK: editor must be from same organization (nullable)
    foreignKey({
      columns: [table.organizationId, table.editedById],
      foreignColumns: [users.organizationId, users.id],
      name: 'notes_edited_by_same_org_fk',
    }),
  ]
);
