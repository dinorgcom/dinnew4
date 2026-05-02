CREATE TABLE "lawyers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"address" text,
	"city" text,
	"postal_code" text,
	"country" text,
	"firm_name" text,
	"firm_url" text,
	"proof_file_url" text,
	"proof_file_pathname" text,
	"proof_file_name" text,
	"called_by" "participant_kind" NOT NULL,
	"notes" text,
	"status" "record_status" DEFAULT 'pending' NOT NULL,
	"discussion" jsonb,
	"discussion_deadline" timestamp with time zone,
	"rejected_by" text,
	"invitation_token" text,
	"invitation_token_expires_at" timestamp with time zone,
	"kyc_verification_id" uuid,
	"original_full_name" text,
	"name_updated_at" timestamp with time zone,
	"review_state" text DEFAULT 'pending',
	"review_extensions" integer DEFAULT 0 NOT NULL,
	"review_dismissal_reason" text,
	"review_dismissal_file_url" text,
	"review_dismissal_file_pathname" text,
	"review_dismissal_file_name" text,
	"review_expertise_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lawyers" ADD CONSTRAINT "lawyers_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lawyers" ADD CONSTRAINT "lawyers_kyc_verification_id_kyc_verifications_id_fk" FOREIGN KEY ("kyc_verification_id") REFERENCES "public"."kyc_verifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lawyers_case_idx" ON "lawyers" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lawyers_invitation_token_idx" ON "lawyers" USING btree ("invitation_token");
