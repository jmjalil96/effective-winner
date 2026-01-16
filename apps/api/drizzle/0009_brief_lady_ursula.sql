ALTER TABLE "organizations" DROP CONSTRAINT "organizations_slug_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_org_agent_id_unique";--> statement-breakpoint
ALTER TABLE "commission_rate_splits" DROP CONSTRAINT "commission_rate_splits_unique";--> statement-breakpoint
ALTER TABLE "commission_rates" DROP CONSTRAINT "commission_rates_unique";--> statement-breakpoint

-- Partial unique indexes for soft-delete compatibility
-- These allow re-creating records with the same business identifier after soft-delete

CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations"("slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users"("email") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_agent_id_unique" ON "agents"("organization_id", "agent_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_rates_unique" ON "commission_rates"("organization_id", "primary_agent_id", "product_id", "business_type", "effective_from") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_rate_splits_unique" ON "commission_rate_splits"("commission_rate_id", "beneficiary_agent_id") WHERE deleted_at IS NULL;