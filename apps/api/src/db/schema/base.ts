import {
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
  uniqueIndex,
  jsonb,
  foreignKey,
  date,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

// Base columns shared by most tables
export const baseColumns = {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

// Re-export drizzle helpers for other schema files
export {
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
  uniqueIndex,
  jsonb,
  foreignKey,
  date,
  uuidv7,
};
