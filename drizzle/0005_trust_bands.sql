-- Trust band columns for assessment_scores
ALTER TABLE "assessment_scores" ADD COLUMN "suggested_band" varchar(20);
ALTER TABLE "assessment_scores" ADD COLUMN "confirmed_band" varchar(20);

-- Trust band columns for assessments (overall)
ALTER TABLE "assessments" ADD COLUMN "suggested_overall_band" varchar(20);
ALTER TABLE "assessments" ADD COLUMN "confirmed_overall_band" varchar(20);
ALTER TABLE "assessments" ADD COLUMN "confirmed_overall_by" uuid REFERENCES "users"("id");
ALTER TABLE "assessments" ADD COLUMN "confirmed_overall_at" timestamptz;
ALTER TABLE "assessments" ADD COLUMN "confirmed_overall_note" text;

-- New audit action for band confirmations
ALTER TYPE "audit_action_type" ADD VALUE IF NOT EXISTS 'BAND_CONFIRMED';
