CREATE TYPE "public"."assessment_status_type" AS ENUM('DRAFT', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."audit_action_type" AS ENUM('ASSESSMENT_CREATED', 'SCORE_OVERRIDDEN', 'CLASSIFICATION_CONFIRMED', 'CLASSIFICATION_OVERRIDDEN', 'CERT_ADDED', 'CERT_DELETED', 'QUESTIONNAIRE_TRIGGERED', 'REASSESSMENT_SCHEDULED', 'ASSESSMENT_DELETED');--> statement-breakpoint
CREATE TYPE "public"."cert_alert_type" AS ENUM('EXPIRING_SOON', 'EXPIRED', 'STALE');--> statement-breakpoint
CREATE TYPE "public"."cert_source_type" AS ENUM('AUTO_VANTA', 'AUTO_SAFEBASE', 'AUTO_WEB', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."cert_type_type" AS ENUM('SOC2_TYPE_I', 'SOC2_TYPE_II', 'ISO_27001', 'ISO_22301', 'ISO_27701', 'CYBER_ESSENTIALS', 'CYBER_ESSENTIALS_PLUS', 'PCI_DSS', 'CSA_STAR', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."dimension_type" AS ENUM('FINANCIAL_HEALTH', 'BREACH_HISTORY', 'SANCTIONS', 'OWNERSHIP', 'TRUST_CERTS', 'NEWS_SENTIMENT');--> statement-breakpoint
CREATE TYPE "public"."dora_classification_type" AS ENUM('CRITICAL', 'IMPORTANT', 'STANDARD');--> statement-breakpoint
CREATE TYPE "public"."questionnaire_status_type" AS ENUM('PENDING', 'DISPATCHED', 'RESPONDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."reassessment_trigger_type" AS ENUM('ANNUAL', 'BREACH_DETECTED', 'CERT_EXPIRING', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."risk_tier_type" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."role_type" AS ENUM('VIEWER', 'ANALYST', 'ADMIN');--> statement-breakpoint
CREATE TABLE "assessment_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"dimension" "dimension_type" NOT NULL,
	"raw_score" smallint NOT NULL,
	"final_score" smallint NOT NULL,
	"is_overridden" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"overridden_by" uuid,
	"overridden_at" timestamp with time zone,
	"source_data" jsonb,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_scores_assessment_id_dimension_unique" UNIQUE("assessment_id","dimension")
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"previous_assessment_id" uuid,
	"vendor_name" varchar(255) NOT NULL,
	"companies_house_number" varchar(20),
	"lei" varchar(20),
	"sic_code" varchar(10),
	"jurisdiction" varchar(100),
	"incorporation_date" date,
	"company_status" varchar(50),
	"assessment_status" "assessment_status_type" DEFAULT 'DRAFT' NOT NULL,
	"risk_tier" "risk_tier_type",
	"risk_tier_override" boolean DEFAULT false NOT NULL,
	"risk_tier_override_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"action_type" "audit_action_type" NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cert_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cert_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"alert_type" "cert_alert_type" NOT NULL,
	"days_remaining" smallint,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cert_alerts_cert_id_alert_type_unique" UNIQUE("cert_id","alert_type")
);
--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"cert_type" "cert_type_type" NOT NULL,
	"issuing_body" varchar(255),
	"audit_period_start" date,
	"audit_period_end" date,
	"expiry_date" date,
	"source_type" "cert_source_type" NOT NULL,
	"source_url" text,
	"notes" text,
	"created_by" uuid,
	"verified_by" uuid,
	"retrieved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dora_classification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"service_type" varchar(100) NOT NULL,
	"processes_personal_data" boolean NOT NULL,
	"loss_impact_over_2hrs" boolean NOT NULL,
	"substitute_available" boolean NOT NULL,
	"regulated_activity_substitute" boolean NOT NULL,
	"classification" "dora_classification_type" NOT NULL,
	"classification_justification" text NOT NULL,
	"is_overridden" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"overridden_by" uuid,
	"overridden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dora_classification_assessment_id_unique" UNIQUE("assessment_id")
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organisations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "questionnaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"status" "questionnaire_status_type" DEFAULT 'PENDING' NOT NULL,
	"trigger_reasons" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"date" date NOT NULL,
	"assessment_count" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_user_id_date_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "reassessment_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"trigger_type" "reassessment_trigger_type" NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth0_id" varchar(128) NOT NULL,
	"org_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"role" "role_type" DEFAULT 'ANALYST' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_auth0_id_unique" UNIQUE("auth0_id")
);
--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_overridden_by_users_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_alerts" ADD CONSTRAINT "cert_alerts_cert_id_certifications_id_fk" FOREIGN KEY ("cert_id") REFERENCES "public"."certifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_alerts" ADD CONSTRAINT "cert_alerts_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_alerts" ADD CONSTRAINT "cert_alerts_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_alerts" ADD CONSTRAINT "cert_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dora_classification" ADD CONSTRAINT "dora_classification_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dora_classification" ADD CONSTRAINT "dora_classification_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dora_classification" ADD CONSTRAINT "dora_classification_overridden_by_users_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reassessment_schedule" ADD CONSTRAINT "reassessment_schedule_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reassessment_schedule" ADD CONSTRAINT "reassessment_schedule_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;