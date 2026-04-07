CREATE TABLE "hearing_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hearing_id" uuid NOT NULL,
	"user_id" text,
	"participant_type" text NOT NULL,
	"role" text NOT NULL,
	"display_name" text NOT NULL,
	"ai_config" jsonb,
	"voice_id" text,
	"personality" text,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"is_active" text DEFAULT 'true' NOT NULL,
	"pika_participant_id" text,
	"meeting_participant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearing_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hearing_id" uuid NOT NULL,
	"speaker" text NOT NULL,
	"speaker_name" text,
	"content" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"sequence_number" text NOT NULL,
	"audio_segment_start" text,
	"audio_segment_end" text,
	"confidence" text,
	"ai_processed" text DEFAULT 'false' NOT NULL,
	"ai_analysis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hearings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"scheduled_start_time" timestamp with time zone NOT NULL,
	"scheduled_end_time" timestamp with time zone,
	"actual_start_time" timestamp with time zone,
	"actual_end_time" timestamp with time zone,
	"meeting_url" text,
	"meeting_platform" text DEFAULT 'google_meet',
	"meeting_id" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"phase" text DEFAULT 'pre_hearing',
	"current_speaker" text,
	"ai_participants_config" jsonb,
	"agent_turn_order" jsonb,
	"transcription_session_id" text,
	"last_transcription_at" timestamp with time zone,
	"pika_session_id" text,
	"is_recording" text DEFAULT 'false' NOT NULL,
	"is_transcribing" text DEFAULT 'true' NOT NULL,
	"auto_transcribe" text DEFAULT 'true' NOT NULL,
	"judge_id" text,
	"claimant_lawyer_id" text,
	"respondent_lawyer_id" text,
	"judge_notes" text,
	"hearing_summary" text,
	"next_hearing_date" timestamp with time zone,
	"outcome" text,
	"technical_notes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hearing_participants" ADD CONSTRAINT "hearing_participants_hearing_id_hearings_id_fk" FOREIGN KEY ("hearing_id") REFERENCES "public"."hearings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearing_transcripts" ADD CONSTRAINT "hearing_transcripts_hearing_id_hearings_id_fk" FOREIGN KEY ("hearing_id") REFERENCES "public"."hearings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hearing_participants_hearing_id_idx" ON "hearing_participants" USING btree ("hearing_id");--> statement-breakpoint
CREATE INDEX "hearing_participants_user_id_idx" ON "hearing_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hearing_participants_role_idx" ON "hearing_participants" USING btree ("role");--> statement-breakpoint
CREATE INDEX "hearing_transcripts_hearing_id_idx" ON "hearing_transcripts" USING btree ("hearing_id");--> statement-breakpoint
CREATE INDEX "hearing_transcripts_timestamp_idx" ON "hearing_transcripts" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "hearing_transcripts_speaker_idx" ON "hearing_transcripts" USING btree ("speaker");--> statement-breakpoint
CREATE INDEX "hearings_case_id_idx" ON "hearings" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "hearings_status_idx" ON "hearings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hearings_scheduled_start_time_idx" ON "hearings" USING btree ("scheduled_start_time");--> statement-breakpoint
CREATE INDEX "hearings_meeting_id_idx" ON "hearings" USING btree ("meeting_id");--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "hearing_date";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "meeting_url";