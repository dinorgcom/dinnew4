ALTER TABLE "case_parties" ADD COLUMN "approval_extensions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE "deadline_reminders_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"threshold" text NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deadline_reminders_sent" ADD CONSTRAINT "deadline_reminders_sent_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deadline_reminders_case_idx" ON "deadline_reminders_sent" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_reminders_unique_idx" ON "deadline_reminders_sent" USING btree ("entity_type", "entity_id", "threshold");
