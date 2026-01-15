import {
  baseColumns,
  pgTable,
  uuid,
  timestamp,
  varchar,
  text,
  boolean,
  index,
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
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    editedById: uuid('edited_by_id').references(() => users.id),
  },
  (table) => [
    index('notes_organization_id_idx').on(table.organizationId),
    index('notes_entity_idx').on(table.entityType, table.entityId),
    index('notes_created_by_id_idx').on(table.createdById),
    index('notes_is_pinned_idx').on(table.isPinned),
  ]
);
