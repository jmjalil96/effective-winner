CREATE TABLE "id_counters" (
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "id_counters_organization_id_entity_type_pk" PRIMARY KEY("organization_id","entity_type")
);
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "dob" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "dob" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "id_counters" ADD CONSTRAINT "id_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;