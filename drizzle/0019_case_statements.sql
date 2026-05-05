ALTER TABLE "cases" ADD COLUMN "claimant_statement" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "respondent_statement" text;--> statement-breakpoint

-- Backfill the new free-form statement columns from any existing
-- structured claims arrays so legacy cases keep their content visible
-- under the new UI. Each claim becomes a paragraph: title on the first
-- line, details on the second (when present). Claims with empty titles
-- are skipped. The legacy columns themselves are NOT dropped to preserve
-- history and audit trails.
UPDATE "cases"
SET "claimant_statement" = sub.joined
FROM (
  SELECT
    c.id AS case_id,
    string_agg(
      CASE
        WHEN COALESCE(item->>'details', '') = '' THEN item->>'claim'
        ELSE (item->>'claim') || E'\n' || (item->>'details')
      END,
      E'\n\n'
    ) AS joined
  FROM "cases" c, jsonb_array_elements(c.claimant_claims) item
  WHERE c.claimant_claims IS NOT NULL
    AND jsonb_typeof(c.claimant_claims) = 'array'
    AND COALESCE(item->>'claim', '') <> ''
  GROUP BY c.id
) sub
WHERE "cases".id = sub.case_id
  AND "cases"."claimant_statement" IS NULL;
--> statement-breakpoint

UPDATE "cases"
SET "respondent_statement" = sub.joined
FROM (
  SELECT
    c.id AS case_id,
    string_agg(
      CASE
        WHEN COALESCE(item->>'details', '') = '' THEN item->>'claim'
        ELSE (item->>'claim') || E'\n' || (item->>'details')
      END,
      E'\n\n'
    ) AS joined
  FROM "cases" c, jsonb_array_elements(c.respondent_claims) item
  WHERE c.respondent_claims IS NOT NULL
    AND jsonb_typeof(c.respondent_claims) = 'array'
    AND COALESCE(item->>'claim', '') <> ''
  GROUP BY c.id
) sub
WHERE "cases".id = sub.case_id
  AND "cases"."respondent_statement" IS NULL;
