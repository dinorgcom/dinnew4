CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('filing', 'evidence_submitted', 'witness_added', 'status_change', 'hearing_scheduled', 'message', 'decision', 'note', 'document_request', 'other');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('user', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."case_role" AS ENUM('claimant', 'respondent', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('draft', 'filed', 'under_review', 'hearing_scheduled', 'in_arbitration', 'awaiting_decision', 'resolved', 'closed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('document', 'contract', 'correspondence', 'photo', 'video', 'audio', 'financial_record', 'expert_report', 'other');--> statement-breakpoint
CREATE TYPE "public"."expertise_status" AS ENUM('draft', 'generating', 'ready', 'published', 'accepted', 'rejected', 'in_dispute', 'ai_approved', 'ai_rejected');--> statement-breakpoint
CREATE TYPE "public"."message_sender_role" AS ENUM('claimant', 'respondent', 'arbitrator', 'system');--> statement-breakpoint
CREATE TYPE "public"."participant_kind" AS ENUM('claimant', 'respondent', 'arbitrator');--> statement-breakpoint
CREATE TYPE "public"."case_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('pending', 'accepted', 'rejected', 'under_review', 'in_dispute', 'ai_approved', 'ai_rejected');--> statement-breakpoint
CREATE TYPE "public"."token_ledger_status" AS ENUM('pending', 'committed', 'reversed');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "app_role" DEFAULT 'user' NOT NULL,
	"account_status" "account_status" DEFAULT 'active' NOT NULL,
	"suspension_reason" text,
	"suspended_at" timestamp with time zone,
	"suspended_by_user_id" text,
	"metadata_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"status" "case_status" DEFAULT 'draft' NOT NULL,
	"priority" "case_priority" DEFAULT 'medium' NOT NULL,
	"claim_amount" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"filing_date" timestamp with time zone,
	"hearing_date" timestamp with time zone,
	"resolution_deadline" timestamp with time zone,
	"claimant_name" text,
	"claimant_email" text,
	"claimant_phone" text,
	"respondent_name" text,
	"respondent_email" text,
	"respondent_phone" text,
	"claimant_claims" jsonb,
	"respondent_claims" jsonb,
	"arbitrator_assigned_name" text,
	"arbitrator_assigned_user_id" text,
	"claimant_lawyer_key" text,
	"respondent_lawyer_key" text,
	"ai_suggestion" text,
	"arbitration_proposal_json" jsonb,
	"judgement_json" jsonb,
	"final_decision" text,
	"settlement_amount" numeric(12, 2),
	"simulation_session_id" text,
	"simulation_share_token" text,
	"simulation_outcome_type" text,
	"simulation_stopping_reason" text,
	"simulation_rounds" numeric(3, 0),
	"simulation_tokens_used" numeric(8, 0),
	"simulation_result" jsonb,
	"simulation_timeline" jsonb,
	"simulation_completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"type" "activity_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"performed_by" text,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"sender_role" "message_sender_role" NOT NULL,
	"sender_name" text,
	"content" text NOT NULL,
	"attachment_url" text,
	"attachment_pathname" text,
	"attachment_name" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"expertise" text,
	"role" text,
	"called_by" "participant_kind" NOT NULL,
	"report" text,
	"report_file_url" text,
	"report_file_pathname" text,
	"status" "record_status" DEFAULT 'pending' NOT NULL,
	"discussion" jsonb,
	"discussion_deadline" timestamp with time zone,
	"rejected_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"evidence_number" integer,
	"title" text NOT NULL,
	"description" text,
	"type" "evidence_type" NOT NULL,
	"status" "record_status" DEFAULT 'pending' NOT NULL,
	"submitted_by" "participant_kind",
	"file_url" text,
	"file_pathname" text,
	"file_name" text,
	"content_type" text,
	"file_size" integer,
	"confidential" boolean DEFAULT false NOT NULL,
	"discussion" jsonb,
	"discussion_deadline" timestamp with time zone,
	"rejected_by" text,
	"original_evidence_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expertise_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_references" jsonb,
	"ai_analysis" text,
	"status" "expertise_status" DEFAULT 'draft' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"discussion" jsonb,
	"discussion_deadline" timestamp with time zone,
	"rejected_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "witnesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"country" text,
	"language" text,
	"relationship" text,
	"called_by" "participant_kind" NOT NULL,
	"statement" text,
	"statement_file_url" text,
	"statement_file_pathname" text,
	"availability" text,
	"testimony_date" timestamp with time zone,
	"status" "record_status" DEFAULT 'pending' NOT NULL,
	"discussion" jsonb,
	"discussion_deadline" timestamp with time zone,
	"rejected_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_user_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid,
	"admin_email" text,
	"target_user_id" uuid,
	"target_email" text,
	"action" text NOT NULL,
	"before_json" jsonb NOT NULL,
	"after_json" jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"requested_by_role" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"title" text,
	"snapshot_json" jsonb NOT NULL,
	"audit_json" jsonb NOT NULL,
	"pdf_file_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lawyer_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid,
	"user_email" text NOT NULL,
	"lawyer_personality" text NOT NULL,
	"party_role" text NOT NULL,
	"messages_json" jsonb,
	"context_summary" text,
	"case_phase" text DEFAULT 'onboarding' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_stripe_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" text NOT NULL,
	"credited_tokens" integer NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"case_id" uuid,
	"delta" integer NOT NULL,
	"kind" text NOT NULL,
	"status" "token_ledger_status" DEFAULT 'committed' NOT NULL,
	"idempotency_key" text NOT NULL,
	"stripe_session_id" text,
	"stripe_event_id" text,
	"metadata_json" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_activities" ADD CONSTRAINT "case_activities_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultants" ADD CONSTRAINT "consultants_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expertise_requests" ADD CONSTRAINT "expertise_requests_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "witnesses" ADD CONSTRAINT "witnesses_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_actions" ADD CONSTRAINT "admin_user_actions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_actions" ADD CONSTRAINT "admin_user_actions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_audits" ADD CONSTRAINT "case_audits_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_audits" ADD CONSTRAINT "case_audits_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lawyer_conversations" ADD CONSTRAINT "lawyer_conversations_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lawyer_conversations" ADD CONSTRAINT "lawyer_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_stripe_events" ADD CONSTRAINT "processed_stripe_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_idx" ON "users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "cases_case_number_idx" ON "cases" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_claimant_email_idx" ON "cases" USING btree ("claimant_email");--> statement-breakpoint
CREATE INDEX "cases_respondent_email_idx" ON "cases" USING btree ("respondent_email");--> statement-breakpoint
CREATE INDEX "case_activities_case_idx" ON "case_activities" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_messages_case_idx" ON "case_messages" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "consultants_case_idx" ON "consultants" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "evidence_case_idx" ON "evidence" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "expertise_case_idx" ON "expertise_requests" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "witnesses_case_idx" ON "witnesses" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "admin_user_actions_target_idx" ON "admin_user_actions" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "case_audits_case_idx" ON "case_audits" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "lawyer_conversations_case_idx" ON "lawyer_conversations" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "processed_stripe_events_event_idx" ON "processed_stripe_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "token_ledger_user_idx" ON "token_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "token_ledger_idempotency_idx" ON "token_ledger" USING btree ("idempotency_key");