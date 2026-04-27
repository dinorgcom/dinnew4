CREATE TABLE IF NOT EXISTS "witness_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "witness_id" uuid NOT NULL,
  "asking_party_role" text NOT NULL,
  "question_text" text NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "witness_questions" ADD CONSTRAINT "witness_questions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "witness_questions" ADD CONSTRAINT "witness_questions_witness_id_witnesses_id_fk" FOREIGN KEY ("witness_id") REFERENCES "public"."witnesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "witness_questions_case_idx" ON "witness_questions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "witness_questions_witness_idx" ON "witness_questions" USING btree ("witness_id");
