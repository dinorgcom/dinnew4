CREATE TABLE "pleadings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"side" "party_side" NOT NULL,
	"round" integer NOT NULL,
	"text" text,
	"file_url" text,
	"file_pathname" text,
	"file_name" text,
	"translation_url" text,
	"translation_pathname" text,
	"translation_name" text,
	"translation_lang" text,
	"locked_at" timestamp with time zone,
	"submitted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pleadings" ADD CONSTRAINT "pleadings_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pleadings" ADD CONSTRAINT "pleadings_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pleadings_case_idx" ON "pleadings" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pleadings_slot_idx" ON "pleadings" USING btree ("case_id", "side", "round");--> statement-breakpoint

-- Backfill: project the existing claimant_statement / respondent_statement
-- (and their attachment + translation columns) into pleadings as round 1.
-- Existing pleadings stay UNLOCKED — the parties can keep editing until
-- they explicitly "Final submit". This preserves any existing in-flight
-- drafts without forcing them into a locked state.
INSERT INTO "pleadings" (
  "case_id", "side", "round",
  "text", "file_url", "file_pathname", "file_name",
  "translation_url", "translation_pathname", "translation_name", "translation_lang",
  "locked_at"
)
SELECT
  "id", 'claimant', 1,
  "claimant_statement",
  "claimant_statement_file_url",
  "claimant_statement_file_pathname",
  "claimant_statement_file_name",
  "claimant_statement_file_translation_url",
  "claimant_statement_file_translation_pathname",
  "claimant_statement_file_translation_name",
  "claimant_statement_file_translation_lang",
  NULL
FROM "cases"
WHERE
  "claimant_statement" IS NOT NULL OR "claimant_statement_file_url" IS NOT NULL
ON CONFLICT ("case_id", "side", "round") DO NOTHING;
--> statement-breakpoint

INSERT INTO "pleadings" (
  "case_id", "side", "round",
  "text", "file_url", "file_pathname", "file_name",
  "translation_url", "translation_pathname", "translation_name", "translation_lang",
  "locked_at"
)
SELECT
  "id", 'respondent', 1,
  "respondent_statement",
  "respondent_statement_file_url",
  "respondent_statement_file_pathname",
  "respondent_statement_file_name",
  "respondent_statement_file_translation_url",
  "respondent_statement_file_translation_pathname",
  "respondent_statement_file_translation_name",
  "respondent_statement_file_translation_lang",
  NULL
FROM "cases"
WHERE
  "respondent_statement" IS NOT NULL OR "respondent_statement_file_url" IS NOT NULL
ON CONFLICT ("case_id", "side", "round") DO NOTHING;
