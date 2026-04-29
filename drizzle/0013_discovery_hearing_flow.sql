ALTER TABLE "cases" ADD COLUMN "discovery_ready_claimant_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "discovery_ready_respondent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hearing_proposals" ADD COLUMN "voting_deadline" timestamp with time zone;
