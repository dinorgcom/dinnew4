ALTER TYPE "public"."activity_type" ADD VALUE 'identity_verified' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'respondent_linked' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "claimant_user_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "claimant_kyc_verification_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "claimant_name_verified" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_name_alleged" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_email_alleged" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_user_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_kyc_verification_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_name_verified" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "original_full_name" text;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "name_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "original_full_name" text;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "name_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_claimant_user_id_users_id_fk" FOREIGN KEY ("claimant_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_claimant_kyc_verification_id_kyc_verifications_id_fk" FOREIGN KEY ("claimant_kyc_verification_id") REFERENCES "public"."kyc_verifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_respondent_user_id_users_id_fk" FOREIGN KEY ("respondent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_respondent_kyc_verification_id_kyc_verifications_id_fk" FOREIGN KEY ("respondent_kyc_verification_id") REFERENCES "public"."kyc_verifications"("id") ON DELETE set null ON UPDATE no action;