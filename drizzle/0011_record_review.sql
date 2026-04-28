ALTER TABLE "witnesses" ADD COLUMN "review_state" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "review_extensions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "review_dismissal_reason" text;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "review_dismissal_file_url" text;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "review_dismissal_file_pathname" text;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "review_dismissal_file_name" text;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "review_expertise_request_id" uuid;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "review_state" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "review_extensions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "review_dismissal_reason" text;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "review_dismissal_file_url" text;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "review_dismissal_file_pathname" text;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "review_dismissal_file_name" text;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "review_expertise_request_id" uuid;
