CREATE TYPE "public"."party_side" AS ENUM('claimant', 'respondent');--> statement-breakpoint
CREATE TYPE "public"."party_status" AS ENUM('pending_approval', 'pending_acceptance', 'active', 'declined', 'removed');--> statement-breakpoint
CREATE TABLE "case_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"side" "party_side" NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"address" text,
	"city" text,
	"postal_code" text,
	"country" text,
	"user_id" uuid,
	"kyc_verification_id" uuid,
	"name_verified" text,
	"is_original" boolean DEFAULT false NOT NULL,
	"status" "party_status" DEFAULT 'pending_approval' NOT NULL,
	"invitation_token" text,
	"invitation_token_expires_at" timestamp with time zone,
	"invited_by_party_id" uuid,
	"approval_deadline" timestamp with time zone,
	"approval_votes_json" jsonb,
	"joined_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_parties" ADD CONSTRAINT "case_parties_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_parties" ADD CONSTRAINT "case_parties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_parties" ADD CONSTRAINT "case_parties_kyc_verification_id_kyc_verifications_id_fk" FOREIGN KEY ("kyc_verification_id") REFERENCES "public"."kyc_verifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_parties" ADD CONSTRAINT "case_parties_invited_by_party_id_case_parties_id_fk" FOREIGN KEY ("invited_by_party_id") REFERENCES "public"."case_parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_parties_case_idx" ON "case_parties" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_parties_email_idx" ON "case_parties" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "case_parties_invitation_token_idx" ON "case_parties" USING btree ("invitation_token");--> statement-breakpoint

-- Backfill: project the original claimant + respondent rows from the
-- existing `cases` table into the new `case_parties` table so multi-party
-- aggregation works for cases that pre-date this change.
INSERT INTO "case_parties" (
  "case_id", "side", "full_name", "email", "phone",
  "address", "city", "postal_code", "country",
  "user_id", "kyc_verification_id", "name_verified",
  "is_original", "status", "joined_at"
)
SELECT
  "id", 'claimant',
  COALESCE("claimant_name", 'Claimant'),
  LOWER("claimant_email"),
  "claimant_phone", "claimant_address", "claimant_city",
  "claimant_postal_code", "claimant_country",
  "claimant_user_id", "claimant_kyc_verification_id", "claimant_name_verified",
  true, 'active', COALESCE("filing_date", "created_at")
FROM "cases"
WHERE "claimant_email" IS NOT NULL AND LENGTH(TRIM("claimant_email")) > 0;
--> statement-breakpoint

INSERT INTO "case_parties" (
  "case_id", "side", "full_name", "email", "phone",
  "address", "city", "postal_code", "country",
  "user_id", "kyc_verification_id", "name_verified",
  "is_original", "status", "joined_at"
)
SELECT
  "id", 'respondent',
  COALESCE("respondent_name", 'Respondent'),
  LOWER("respondent_email"),
  "respondent_phone", "respondent_address", "respondent_city",
  "respondent_postal_code", "respondent_country",
  "respondent_user_id", "respondent_kyc_verification_id", "respondent_name_verified",
  true, 'active', COALESCE("respondent_linked_at", "filing_date", "created_at")
FROM "cases"
WHERE "respondent_email" IS NOT NULL AND LENGTH(TRIM("respondent_email")) > 0;
