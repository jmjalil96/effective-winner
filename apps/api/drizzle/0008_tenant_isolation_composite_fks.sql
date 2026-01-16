-- Migration: Tenant Isolation via Composite Foreign Keys
-- This ensures all foreign keys validate organization_id consistency,
-- preventing cross-tenant data references at the database level.

-- ============================================================================
-- STEP 1: Add composite unique constraints to parent tables
-- These are required for composite FK references
-- ============================================================================

ALTER TABLE "users" ADD CONSTRAINT "users_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "insurers" ADD CONSTRAINT "insurers_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "policy_movements" ADD CONSTRAINT "policy_movements_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "commission_statements" ADD CONSTRAINT "commission_statements_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "agent_statements" ADD CONSTRAINT "agent_statements_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_org_id_key" UNIQUE ("organization_id", "id");
--> statement-breakpoint
ALTER TABLE "health_claims" ADD CONSTRAINT "health_claims_org_id_key" UNIQUE ("organization_id", "id");

-- ============================================================================
-- STEP 2: Convert simple FKs to composite FKs
-- Pattern: DROP old FK, ADD new composite FK
-- ============================================================================

-- ----------------------------------------------------------------------------
-- users.role_id → roles (user must have role from same org)
-- ----------------------------------------------------------------------------
ALTER TABLE "users" DROP CONSTRAINT "users_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_same_org_fk"
  FOREIGN KEY ("organization_id", "role_id")
  REFERENCES "roles" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- sessions.user_id → users (session must be for user in same org)
-- ----------------------------------------------------------------------------
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_same_org_fk"
  FOREIGN KEY ("organization_id", "user_id")
  REFERENCES "users" ("organization_id", "id") ON DELETE cascade ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- invitations.role_id → roles (invitation must use role from same org)
-- ----------------------------------------------------------------------------
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_same_org_fk"
  FOREIGN KEY ("organization_id", "role_id")
  REFERENCES "roles" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- invitations.invited_by_id → users (inviter must be from same org)
-- ----------------------------------------------------------------------------
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_invited_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_same_org_fk"
  FOREIGN KEY ("organization_id", "invited_by_id")
  REFERENCES "users" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- audit_logs.actor_id → users (actor must be from same org, nullable)
-- ----------------------------------------------------------------------------
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_same_org_fk"
  FOREIGN KEY ("organization_id", "actor_id")
  REFERENCES "users" ("organization_id", "id") ON DELETE set null ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- insurer_contacts.insurer_id → insurers
-- ----------------------------------------------------------------------------
ALTER TABLE "insurer_contacts" DROP CONSTRAINT "insurer_contacts_insurer_id_insurers_id_fk";
--> statement-breakpoint
ALTER TABLE "insurer_contacts" ADD CONSTRAINT "insurer_contacts_insurer_same_org_fk"
  FOREIGN KEY ("organization_id", "insurer_id")
  REFERENCES "insurers" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- products.insurer_id → insurers
-- ----------------------------------------------------------------------------
ALTER TABLE "products" DROP CONSTRAINT "products_insurer_id_insurers_id_fk";
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_insurer_same_org_fk"
  FOREIGN KEY ("organization_id", "insurer_id")
  REFERENCES "insurers" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- accounts.agent_id → agents
-- ----------------------------------------------------------------------------
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_agent_same_org_fk"
  FOREIGN KEY ("organization_id", "agent_id")
  REFERENCES "agents" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- clients.account_id → accounts
-- ----------------------------------------------------------------------------
ALTER TABLE "clients" DROP CONSTRAINT "clients_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_account_same_org_fk"
  FOREIGN KEY ("organization_id", "account_id")
  REFERENCES "accounts" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- client_contacts.client_id → clients
-- ----------------------------------------------------------------------------
ALTER TABLE "client_contacts" DROP CONSTRAINT "client_contacts_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_same_org_fk"
  FOREIGN KEY ("organization_id", "client_id")
  REFERENCES "clients" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- policies.client_id → clients
-- ----------------------------------------------------------------------------
ALTER TABLE "policies" DROP CONSTRAINT "policies_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_client_same_org_fk"
  FOREIGN KEY ("organization_id", "client_id")
  REFERENCES "clients" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- policies.agent_id → agents
-- ----------------------------------------------------------------------------
ALTER TABLE "policies" DROP CONSTRAINT "policies_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_agent_same_org_fk"
  FOREIGN KEY ("organization_id", "agent_id")
  REFERENCES "agents" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- policies.product_id → products
-- ----------------------------------------------------------------------------
ALTER TABLE "policies" DROP CONSTRAINT "policies_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_product_same_org_fk"
  FOREIGN KEY ("organization_id", "product_id")
  REFERENCES "products" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- policies.renewed_from_id → policies (self-reference, same org)
-- ----------------------------------------------------------------------------
-- Note: This FK doesn't exist yet (renewedFromId has no .references() in schema)
-- Adding it now for consistency
ALTER TABLE "policies" ADD CONSTRAINT "policies_renewed_from_same_org_fk"
  FOREIGN KEY ("organization_id", "renewed_from_id")
  REFERENCES "policies" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- policy_movements.policy_id → policies
-- ----------------------------------------------------------------------------
ALTER TABLE "policy_movements" DROP CONSTRAINT "policy_movements_policy_id_policies_id_fk";
--> statement-breakpoint
ALTER TABLE "policy_movements" ADD CONSTRAINT "policy_movements_policy_same_org_fk"
  FOREIGN KEY ("organization_id", "policy_id")
  REFERENCES "policies" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- payments.policy_movement_id → policy_movements
-- ----------------------------------------------------------------------------
ALTER TABLE "payments" DROP CONSTRAINT "payments_policy_movement_id_policy_movements_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_policy_movement_same_org_fk"
  FOREIGN KEY ("organization_id", "policy_movement_id")
  REFERENCES "policy_movements" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- commission_statements.insurer_id → insurers
-- ----------------------------------------------------------------------------
ALTER TABLE "commission_statements" DROP CONSTRAINT "commission_statements_insurer_id_insurers_id_fk";
--> statement-breakpoint
ALTER TABLE "commission_statements" ADD CONSTRAINT "commission_statements_insurer_same_org_fk"
  FOREIGN KEY ("organization_id", "insurer_id")
  REFERENCES "insurers" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- commission_statements.related_statement_id → commission_statements (self-ref)
-- Note: This FK doesn't exist yet, adding for consistency
-- ----------------------------------------------------------------------------
ALTER TABLE "commission_statements" ADD CONSTRAINT "commission_statements_related_same_org_fk"
  FOREIGN KEY ("organization_id", "related_statement_id")
  REFERENCES "commission_statements" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- agent_statements.agent_id → agents
-- ----------------------------------------------------------------------------
ALTER TABLE "agent_statements" DROP CONSTRAINT "agent_statements_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_statements" ADD CONSTRAINT "agent_statements_agent_same_org_fk"
  FOREIGN KEY ("organization_id", "agent_id")
  REFERENCES "agents" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- agent_commissions.commission_statement_id → commission_statements
-- ----------------------------------------------------------------------------
ALTER TABLE "agent_commissions" DROP CONSTRAINT "agent_commissions_commission_statement_id_commission_statements";
--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_statement_same_org_fk"
  FOREIGN KEY ("organization_id", "commission_statement_id")
  REFERENCES "commission_statements" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- agent_commissions.policy_id → policies
-- ----------------------------------------------------------------------------
ALTER TABLE "agent_commissions" DROP CONSTRAINT "agent_commissions_policy_id_policies_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_policy_same_org_fk"
  FOREIGN KEY ("organization_id", "policy_id")
  REFERENCES "policies" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- agent_commissions.agent_id → agents
-- ----------------------------------------------------------------------------
ALTER TABLE "agent_commissions" DROP CONSTRAINT "agent_commissions_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_same_org_fk"
  FOREIGN KEY ("organization_id", "agent_id")
  REFERENCES "agents" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- agent_commissions.agent_statement_id → agent_statements (nullable)
-- ----------------------------------------------------------------------------
ALTER TABLE "agent_commissions" DROP CONSTRAINT "agent_commissions_agent_statement_id_agent_statements_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_statement_same_org_fk"
  FOREIGN KEY ("organization_id", "agent_statement_id")
  REFERENCES "agent_statements" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- commission_rates.primary_agent_id → agents
-- ----------------------------------------------------------------------------
ALTER TABLE "commission_rates" DROP CONSTRAINT "commission_rates_primary_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_agent_same_org_fk"
  FOREIGN KEY ("organization_id", "primary_agent_id")
  REFERENCES "agents" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- commission_rates.product_id → products
-- ----------------------------------------------------------------------------
ALTER TABLE "commission_rates" DROP CONSTRAINT "commission_rates_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_product_same_org_fk"
  FOREIGN KEY ("organization_id", "product_id")
  REFERENCES "products" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- commission_rate_splits.commission_rate_id → commission_rates
-- ----------------------------------------------------------------------------
ALTER TABLE "commission_rate_splits" DROP CONSTRAINT "commission_rate_splits_commission_rate_id_commission_rates_id_f";
--> statement-breakpoint
ALTER TABLE "commission_rate_splits" ADD CONSTRAINT "commission_rate_splits_rate_same_org_fk"
  FOREIGN KEY ("organization_id", "commission_rate_id")
  REFERENCES "commission_rates" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- commission_rate_splits.beneficiary_agent_id → agents
-- ----------------------------------------------------------------------------
ALTER TABLE "commission_rate_splits" DROP CONSTRAINT "commission_rate_splits_beneficiary_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "commission_rate_splits" ADD CONSTRAINT "commission_rate_splits_agent_same_org_fk"
  FOREIGN KEY ("organization_id", "beneficiary_agent_id")
  REFERENCES "agents" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- health_claims.policy_id → policies
-- ----------------------------------------------------------------------------
ALTER TABLE "health_claims" DROP CONSTRAINT "health_claims_policy_id_policies_id_fk";
--> statement-breakpoint
ALTER TABLE "health_claims" ADD CONSTRAINT "health_claims_policy_same_org_fk"
  FOREIGN KEY ("organization_id", "policy_id")
  REFERENCES "policies" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- health_claims.related_claim_id → health_claims (self-reference)
-- Note: This FK doesn't exist yet, adding for consistency
-- ----------------------------------------------------------------------------
ALTER TABLE "health_claims" ADD CONSTRAINT "health_claims_related_same_org_fk"
  FOREIGN KEY ("organization_id", "related_claim_id")
  REFERENCES "health_claims" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- pc_claims.policy_id → policies
-- ----------------------------------------------------------------------------
ALTER TABLE "pc_claims" DROP CONSTRAINT "pc_claims_policy_id_policies_id_fk";
--> statement-breakpoint
ALTER TABLE "pc_claims" ADD CONSTRAINT "pc_claims_policy_same_org_fk"
  FOREIGN KEY ("organization_id", "policy_id")
  REFERENCES "policies" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- notes.created_by_id → users
-- ----------------------------------------------------------------------------
ALTER TABLE "notes" DROP CONSTRAINT "notes_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_same_org_fk"
  FOREIGN KEY ("organization_id", "created_by_id")
  REFERENCES "users" ("organization_id", "id") ON DELETE no action ON UPDATE no action;

-- ----------------------------------------------------------------------------
-- notes.edited_by_id → users (nullable)
-- ----------------------------------------------------------------------------
ALTER TABLE "notes" DROP CONSTRAINT "notes_edited_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_edited_by_same_org_fk"
  FOREIGN KEY ("organization_id", "edited_by_id")
  REFERENCES "users" ("organization_id", "id") ON DELETE no action ON UPDATE no action;
