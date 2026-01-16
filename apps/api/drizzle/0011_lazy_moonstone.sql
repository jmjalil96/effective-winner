-- Drop partial index from migration 0006
DROP INDEX IF EXISTS "roles_org_name_unique";--> statement-breakpoint

-- Add strict unique constraint
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_name_unique" UNIQUE("organization_id","name");