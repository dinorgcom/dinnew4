ALTER TABLE "cases" ADD COLUMN "claimant_address" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "claimant_city" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "claimant_postal_code" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "claimant_country" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_address" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_city" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_postal_code" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_country" text;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "witnesses" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "country" text;
