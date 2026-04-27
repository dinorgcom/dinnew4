CREATE TABLE IF NOT EXISTS "hearing_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "slots" jsonb NOT NULL,
  "availability" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "selected_slot_index" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "hearing_proposals" ADD CONSTRAINT "hearing_proposals_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hearing_proposals_case_idx" ON "hearing_proposals" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hearing_proposals_status_idx" ON "hearing_proposals" USING btree ("status");
