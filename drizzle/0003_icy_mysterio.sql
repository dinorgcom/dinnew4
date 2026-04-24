CREATE TYPE "public"."kyc_status" AS ENUM('not_started', 'pending', 'verified', 'requires_input', 'canceled');--> statement-breakpoint
CREATE TABLE "kyc_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_session_id" text NOT NULL,
	"status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"verified_first_name" text,
	"verified_last_name" text,
	"verified_dob_day" integer,
	"verified_dob_month" integer,
	"verified_dob_year" integer,
	"verified_address_line1" text,
	"verified_address_line2" text,
	"verified_address_city" text,
	"verified_address_state" text,
	"verified_address_postal_code" text,
	"verified_address_country" text,
	"verified_id_number" text,
	"verified_id_number_type" text,
	"verified_outputs_json" jsonb,
	"last_error_code" text,
	"last_error_reason" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consultants" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "witnesses" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "processed_stripe_events" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kyc_verification_id" uuid;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "invitation_token" text;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "invitation_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "kyc_verification_id" uuid;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "invitation_token" text;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "invitation_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "kyc_verification_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_verifications_stripe_session_idx" ON "kyc_verifications" USING btree ("stripe_session_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_kyc_verification_id_kyc_verifications_id_fk" FOREIGN KEY ("kyc_verification_id") REFERENCES "public"."kyc_verifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultants" ADD CONSTRAINT "consultants_kyc_verification_id_kyc_verifications_id_fk" FOREIGN KEY ("kyc_verification_id") REFERENCES "public"."kyc_verifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "witnesses" ADD CONSTRAINT "witnesses_kyc_verification_id_kyc_verifications_id_fk" FOREIGN KEY ("kyc_verification_id") REFERENCES "public"."kyc_verifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consultants_invitation_token_idx" ON "consultants" USING btree ("invitation_token");--> statement-breakpoint
CREATE UNIQUE INDEX "witnesses_invitation_token_idx" ON "witnesses" USING btree ("invitation_token");