-- Create simulations table
CREATE TABLE "simulations" (
	"id" text PRIMARY KEY DEFAULT "gen_random_uuid"() NOT NULL,
	"case_id" text NOT NULL,
	"session_id" text NOT NULL,
	"share_token" text,
	"outcome_type" text,
	"stopping_reason" text,
	"rounds" numeric(3,0),
	"tokens_used" numeric(8,0),
	"result" jsonb,
	"timeline" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
--> CREATE INDEX "simulations_case_id_idx" ON "simulations" ("case_id");
--> CREATE INDEX "simulations_session_id_idx" ON "simulations" ("session_id");
--> CREATE INDEX "simulations_completed_at_idx" ON "simulations" ("completed_at");

-- Add currentSimulationId to cases table
ALTER TABLE "cases" ADD COLUMN "current_simulation_id" text;

-- Create foreign key constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'cases_current_simulation_id_fkey'
    ) THEN
        ALTER TABLE "cases" ADD CONSTRAINT "cases_current_simulation_id_fkey" FOREIGN KEY ("current_simulation_id") REFERENCES "simulations"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;

-- Migrate existing simulation data
INSERT INTO "simulations" (
    "id",
    "case_id", 
    "session_id",
    "share_token",
    "outcome_type",
    "stopping_reason",
    "rounds",
    "tokens_used",
    "result",
    "timeline",
    "completed_at",
    "created_at",
    "updated_at"
)
SELECT 
    "gen_random_uuid"() as id,
    "id" as case_id,
    "simulation_session_id" as session_id,
    "simulation_share_token" as share_token,
    "simulation_outcome_type" as outcome_type,
    "simulation_stopping_reason" as stopping_reason,
    "simulation_rounds" as rounds,
    "simulation_tokens_used" as tokens_used,
    "simulation_result" as result,
    "simulation_timeline" as timeline,
    "simulation_completed_at" as completed_at,
    "created_at",
    "updated_at"
FROM "cases"
WHERE "simulation_session_id" IS NOT NULL;

-- Update cases to reference the new simulation records
UPDATE "cases" 
SET "current_simulation_id" = "simulations"."id"
FROM "simulations"
WHERE "cases"."id" = "simulations"."case_id" 
AND "cases"."simulation_session_id" IS NOT NULL;

-- Drop old simulation columns from cases table
ALTER TABLE "cases" DROP COLUMN IF EXISTS "simulation_session_id";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "simulation_share_token";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "simulation_outcome_type";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "simulation_stopping_reason";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "simulation_rounds";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "simulation_tokens_used";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "simulation_result";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "simulation_timeline";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "simulation_completed_at";

-- Add index for current_simulation_id
CREATE INDEX "cases_current_simulation_id_idx" ON "cases" ("current_simulation_id");
