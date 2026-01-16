-- Drop partial indexes first (from migration 0009)
DROP INDEX IF EXISTS "organizations_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "users_email_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "agents_org_agent_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "commission_rates_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "commission_rate_splits_unique";--> statement-breakpoint

-- Add strict unique constraints
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_agent_id_unique" UNIQUE("organization_id","agent_id");--> statement-breakpoint
ALTER TABLE "commission_rate_splits" ADD CONSTRAINT "commission_rate_splits_unique" UNIQUE("commission_rate_id","beneficiary_agent_id");--> statement-breakpoint
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_unique" UNIQUE("organization_id","primary_agent_id","product_id","business_type","effective_from");