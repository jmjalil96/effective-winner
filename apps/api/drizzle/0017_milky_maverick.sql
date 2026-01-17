ALTER TABLE "clients" ADD COLUMN "client_id" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_org_client_id_unique" UNIQUE("organization_id","client_id");