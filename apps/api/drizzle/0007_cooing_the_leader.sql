CREATE TABLE "health_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"claim_id" varchar(100) NOT NULL,
	"claim_type" varchar(20) NOT NULL,
	"related_claim_id" uuid,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attention_type" varchar(50),
	"patient_name" varchar(255) NOT NULL,
	"diagnosis" text,
	"amount_submitted" numeric(12, 2) NOT NULL,
	"amount_approved" numeric(12, 2),
	"incident_date" timestamp with time zone,
	"submitted_date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pc_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"claim_id" varchar(100) NOT NULL,
	"insurer_claim_number" varchar(100),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"amount_submitted" numeric(12, 2) NOT NULL,
	"amount_approved" numeric(12, 2),
	"submitted_date" timestamp with time zone NOT NULL,
	"incident_date" timestamp with time zone,
	"incident_description" text
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"agent_id" varchar(50) NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"gov_id_type" varchar(20),
	"gov_id_number" varchar(20),
	"email" varchar(255),
	"phone" varchar(50),
	"dob" timestamp with time zone,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"is_house_agent" boolean DEFAULT false NOT NULL,
	CONSTRAINT "agents_org_agent_id_unique" UNIQUE("organization_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"role" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"client_type" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"gov_id_type" varchar(20),
	"gov_id_number" varchar(20),
	"phone" varchar(50),
	"email" varchar(255),
	"sex" varchar(10),
	"dob" timestamp with time zone,
	"business_description" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_commissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"commission_statement_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_statement_id" uuid,
	"total_premium" numeric(12, 2),
	"prorata_premium" numeric(12, 2),
	"commission_rate" numeric(5, 4),
	"amount" numeric(12, 2) NOT NULL,
	"commission_type" varchar(20) NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "agent_statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"validation_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"sent" boolean DEFAULT false NOT NULL,
	"total_commission" numeric(12, 2) NOT NULL,
	"agent_invoice" varchar(100),
	"payment_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"payment_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "commission_rate_splits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"commission_rate_id" uuid NOT NULL,
	"beneficiary_agent_id" uuid NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"split_order" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "commission_rate_splits_unique" UNIQUE("commission_rate_id","beneficiary_agent_id")
);
--> statement-breakpoint
CREATE TABLE "commission_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"primary_agent_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"business_type" varchar(20) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	CONSTRAINT "commission_rates_unique" UNIQUE("organization_id","primary_agent_id","product_id","business_type","effective_from")
);
--> statement-breakpoint
CREATE TABLE "commission_statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"insurer_id" uuid NOT NULL,
	"statement_id" varchar(100) NOT NULL,
	"date_received" timestamp with time zone NOT NULL,
	"commercial_unit" varchar(100),
	"statement_type" varchar(20) NOT NULL,
	"related_statement_id" uuid,
	"value" numeric(12, 2) NOT NULL,
	"tax_rate" numeric(5, 4),
	"reconciliation_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"invoice_number" varchar(100),
	"invoice_date" timestamp with time zone,
	"invoice_status" varchar(20),
	"payment_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "insurance_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type_id" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"area" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insurance_types_type_id_unique" UNIQUE("type_id")
);
--> statement-breakpoint
CREATE TABLE "insurer_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"insurer_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"role" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "insurers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"gov_id" varchar(20),
	"contract_number" varchar(100),
	"email" varchar(255),
	"phone" varchar(50),
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"insurer_id" uuid NOT NULL,
	"insurance_type_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"nb_commission" varchar(10),
	"renewal_commission" varchar(10),
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"policy_movement_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"payment_method" varchar(50),
	"reference" varchar(100),
	"notes" text,
	"status" varchar(20) DEFAULT 'completed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"insurance_type_id" uuid NOT NULL,
	"renewed_from_id" uuid,
	"policy_number" varchar(100),
	"business_type" varchar(20) NOT NULL,
	"commercial_unit" varchar(100),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"initial_effective_date" timestamp with time zone,
	"effective_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"payment_periodicity" varchar(20),
	"irregular_commission" boolean DEFAULT false NOT NULL,
	"documentation_complete" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"movement_type" varchar(20) NOT NULL,
	"insurer_movement_id" varchar(100),
	"effective_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"net_premium" numeric(12, 2),
	"gross_premium" numeric(12, 2),
	"first_payment" numeric(12, 2),
	"invoice_number" varchar(100),
	"invoice_date" timestamp with time zone,
	"description" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid NOT NULL,
	"edited_at" timestamp with time zone,
	"edited_by_id" uuid
);
--> statement-breakpoint
ALTER TABLE "health_claims" ADD CONSTRAINT "health_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_claims" ADD CONSTRAINT "health_claims_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pc_claims" ADD CONSTRAINT "pc_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pc_claims" ADD CONSTRAINT "pc_claims_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_commission_statement_id_commission_statements_id_fk" FOREIGN KEY ("commission_statement_id") REFERENCES "public"."commission_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_statement_id_agent_statements_id_fk" FOREIGN KEY ("agent_statement_id") REFERENCES "public"."agent_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_statements" ADD CONSTRAINT "agent_statements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_statements" ADD CONSTRAINT "agent_statements_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rate_splits" ADD CONSTRAINT "commission_rate_splits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rate_splits" ADD CONSTRAINT "commission_rate_splits_commission_rate_id_commission_rates_id_fk" FOREIGN KEY ("commission_rate_id") REFERENCES "public"."commission_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rate_splits" ADD CONSTRAINT "commission_rate_splits_beneficiary_agent_id_agents_id_fk" FOREIGN KEY ("beneficiary_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_primary_agent_id_agents_id_fk" FOREIGN KEY ("primary_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_statements" ADD CONSTRAINT "commission_statements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_statements" ADD CONSTRAINT "commission_statements_insurer_id_insurers_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurer_contacts" ADD CONSTRAINT "insurer_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurer_contacts" ADD CONSTRAINT "insurer_contacts_insurer_id_insurers_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurers" ADD CONSTRAINT "insurers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_insurer_id_insurers_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_insurance_type_id_insurance_types_id_fk" FOREIGN KEY ("insurance_type_id") REFERENCES "public"."insurance_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_policy_movement_id_policy_movements_id_fk" FOREIGN KEY ("policy_movement_id") REFERENCES "public"."policy_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_insurance_type_id_insurance_types_id_fk" FOREIGN KEY ("insurance_type_id") REFERENCES "public"."insurance_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_movements" ADD CONSTRAINT "policy_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_movements" ADD CONSTRAINT "policy_movements_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_claims_organization_id_idx" ON "health_claims" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "health_claims_policy_id_idx" ON "health_claims" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "health_claims_claim_type_idx" ON "health_claims" USING btree ("claim_type");--> statement-breakpoint
CREATE INDEX "health_claims_related_claim_id_idx" ON "health_claims" USING btree ("related_claim_id");--> statement-breakpoint
CREATE INDEX "health_claims_status_idx" ON "health_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "health_claims_submitted_date_idx" ON "health_claims" USING btree ("submitted_date");--> statement-breakpoint
CREATE INDEX "pc_claims_organization_id_idx" ON "pc_claims" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pc_claims_policy_id_idx" ON "pc_claims" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "pc_claims_status_idx" ON "pc_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pc_claims_submitted_date_idx" ON "pc_claims" USING btree ("submitted_date");--> statement-breakpoint
CREATE INDEX "accounts_organization_id_idx" ON "accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "accounts_agent_id_idx" ON "accounts" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "accounts_status_idx" ON "accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agents_organization_id_idx" ON "agents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agents_is_house_agent_idx" ON "agents" USING btree ("is_house_agent");--> statement-breakpoint
CREATE INDEX "client_contacts_organization_id_idx" ON "client_contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "client_contacts_client_id_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "clients_organization_id_idx" ON "clients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "clients_account_id_idx" ON "clients" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "clients_client_type_idx" ON "clients" USING btree ("client_type");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_commissions_organization_id_idx" ON "agent_commissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_commissions_commission_statement_id_idx" ON "agent_commissions" USING btree ("commission_statement_id");--> statement-breakpoint
CREATE INDEX "agent_commissions_policy_id_idx" ON "agent_commissions" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "agent_commissions_agent_id_idx" ON "agent_commissions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_commissions_agent_statement_id_idx" ON "agent_commissions" USING btree ("agent_statement_id");--> statement-breakpoint
CREATE INDEX "agent_commissions_commission_type_idx" ON "agent_commissions" USING btree ("commission_type");--> statement-breakpoint
CREATE INDEX "agent_statements_organization_id_idx" ON "agent_statements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_statements_agent_id_idx" ON "agent_statements" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_statements_date_idx" ON "agent_statements" USING btree ("date");--> statement-breakpoint
CREATE INDEX "agent_statements_validation_status_idx" ON "agent_statements" USING btree ("validation_status");--> statement-breakpoint
CREATE INDEX "agent_statements_payment_status_idx" ON "agent_statements" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "commission_rate_splits_organization_id_idx" ON "commission_rate_splits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "commission_rate_splits_commission_rate_id_idx" ON "commission_rate_splits" USING btree ("commission_rate_id");--> statement-breakpoint
CREATE INDEX "commission_rate_splits_beneficiary_agent_id_idx" ON "commission_rate_splits" USING btree ("beneficiary_agent_id");--> statement-breakpoint
CREATE INDEX "commission_rates_organization_id_idx" ON "commission_rates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "commission_rates_primary_agent_id_idx" ON "commission_rates" USING btree ("primary_agent_id");--> statement-breakpoint
CREATE INDEX "commission_rates_product_id_idx" ON "commission_rates" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "commission_rates_business_type_idx" ON "commission_rates" USING btree ("business_type");--> statement-breakpoint
CREATE INDEX "commission_rates_effective_from_idx" ON "commission_rates" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX "commission_statements_organization_id_idx" ON "commission_statements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "commission_statements_insurer_id_idx" ON "commission_statements" USING btree ("insurer_id");--> statement-breakpoint
CREATE INDEX "commission_statements_statement_type_idx" ON "commission_statements" USING btree ("statement_type");--> statement-breakpoint
CREATE INDEX "commission_statements_related_statement_id_idx" ON "commission_statements" USING btree ("related_statement_id");--> statement-breakpoint
CREATE INDEX "commission_statements_reconciliation_status_idx" ON "commission_statements" USING btree ("reconciliation_status");--> statement-breakpoint
CREATE INDEX "commission_statements_date_received_idx" ON "commission_statements" USING btree ("date_received");--> statement-breakpoint
CREATE INDEX "insurer_contacts_organization_id_idx" ON "insurer_contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "insurer_contacts_insurer_id_idx" ON "insurer_contacts" USING btree ("insurer_id");--> statement-breakpoint
CREATE INDEX "insurers_organization_id_idx" ON "insurers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "insurers_status_idx" ON "insurers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_organization_id_idx" ON "products" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "products_insurer_id_idx" ON "products" USING btree ("insurer_id");--> statement-breakpoint
CREATE INDEX "products_insurance_type_id_idx" ON "products" USING btree ("insurance_type_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_organization_id_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_policy_movement_id_idx" ON "payments" USING btree ("policy_movement_id");--> statement-breakpoint
CREATE INDEX "payments_payment_date_idx" ON "payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "policies_organization_id_idx" ON "policies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "policies_client_id_idx" ON "policies" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "policies_agent_id_idx" ON "policies" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "policies_product_id_idx" ON "policies" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "policies_insurance_type_id_idx" ON "policies" USING btree ("insurance_type_id");--> statement-breakpoint
CREATE INDEX "policies_renewed_from_id_idx" ON "policies" USING btree ("renewed_from_id");--> statement-breakpoint
CREATE INDEX "policies_status_idx" ON "policies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "policies_effective_date_idx" ON "policies" USING btree ("effective_date");--> statement-breakpoint
CREATE INDEX "policies_end_date_idx" ON "policies" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "policy_movements_organization_id_idx" ON "policy_movements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "policy_movements_policy_id_idx" ON "policy_movements" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "policy_movements_movement_type_idx" ON "policy_movements" USING btree ("movement_type");--> statement-breakpoint
CREATE INDEX "policy_movements_effective_date_idx" ON "policy_movements" USING btree ("effective_date");--> statement-breakpoint
CREATE INDEX "policy_movements_status_idx" ON "policy_movements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notes_organization_id_idx" ON "notes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notes_entity_idx" ON "notes" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "notes_created_by_id_idx" ON "notes" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "notes_is_pinned_idx" ON "notes" USING btree ("is_pinned");