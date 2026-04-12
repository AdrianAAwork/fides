CREATE TYPE "public"."sanction_source" AS ENUM('OFSI', 'OFAC', 'EU');--> statement-breakpoint
CREATE TYPE "public"."sanction_type" AS ENUM('individual', 'entity');--> statement-breakpoint
CREATE TABLE "sanctions_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(500) NOT NULL,
	"aliases" jsonb DEFAULT '[]' NOT NULL,
	"source" "sanction_source" NOT NULL,
	"type" "sanction_type" NOT NULL,
	"reference_number" varchar(100),
	"listed_at" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "overall_score" smallint;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "exec_summary_json" jsonb;--> statement-breakpoint
CREATE INDEX "sanctions_name_idx" ON "sanctions_entries" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sanctions_source_idx" ON "sanctions_entries" USING btree ("source");