ALTER TABLE "evidence" ADD COLUMN IF NOT EXISTS "context_json" jsonb;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "hearing_preparations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "case_map_json" jsonb,
  "disputed_issues_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_briefs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "claimant_script_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "respondent_script_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reconciliation_memo_json" jsonb,
  "witness_scripts_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "final_fact_finding_memo_json" jsonb,
  "generated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "hearing_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "preparation_id" uuid NOT NULL,
  "participant_role" text NOT NULL,
  "participant_name" text,
  "witness_id" uuid,
  "status" text DEFAULT 'not_started' NOT NULL,
  "script_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "current_script_item_id" text,
  "completed_script_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "follow_up_counts_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "transcript_summary_json" jsonb,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "hearing_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "sender_role" text NOT NULL,
  "content" text NOT NULL,
  "script_item_id" text,
  "referenced_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "message_type" text DEFAULT 'statement' NOT NULL,
  "ai_analysis_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "hearing_preparations" ADD CONSTRAINT "hearing_preparations_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearing_sessions" ADD CONSTRAINT "hearing_sessions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearing_sessions" ADD CONSTRAINT "hearing_sessions_preparation_id_hearing_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."hearing_preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearing_messages" ADD CONSTRAINT "hearing_messages_session_id_hearing_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."hearing_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearing_messages" ADD CONSTRAINT "hearing_messages_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "hearing_preparations_case_idx" ON "hearing_preparations" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hearing_preparations_status_idx" ON "hearing_preparations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hearing_sessions_case_idx" ON "hearing_sessions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hearing_sessions_preparation_idx" ON "hearing_sessions" USING btree ("preparation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hearing_sessions_status_idx" ON "hearing_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hearing_sessions_participant_role_idx" ON "hearing_sessions" USING btree ("participant_role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hearing_messages_session_idx" ON "hearing_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hearing_messages_case_idx" ON "hearing_messages" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hearing_messages_script_item_idx" ON "hearing_messages" USING btree ("script_item_id");
