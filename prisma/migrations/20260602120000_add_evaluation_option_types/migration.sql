CREATE TABLE IF NOT EXISTS "evaluation_option_types" (
  "id" SERIAL PRIMARY KEY,
  "code" VARCHAR(50) NOT NULL UNIQUE,
  "name_ar" VARCHAR(100) NOT NULL,
  "name_en" VARCHAR(100),
  "color" VARCHAR(30),
  "icon" VARCHAR(50),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "affects_score" BOOLEAN NOT NULL DEFAULT TRUE,
  "score_multiplier" DECIMAL(5, 2) NOT NULL DEFAULT 1.00,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "criteria_options"
ADD COLUMN IF NOT EXISTS "option_type_id" INTEGER;

ALTER TABLE "criteria_options"
DROP CONSTRAINT IF EXISTS "criteria_options_option_type_id_fkey";

ALTER TABLE "criteria_options"
ADD CONSTRAINT "criteria_options_option_type_id_fkey"
FOREIGN KEY ("option_type_id") REFERENCES "evaluation_option_types"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "evaluation_option_types"
  ("code", "name_ar", "name_en", "color", "icon", "sort_order", "affects_score", "score_multiplier", "is_active")
VALUES
  ('positive', 'إيجابي', 'Positive', '#2a9d8f', 'check-circle', 1, TRUE, 1.00, TRUE),
  ('negative', 'سلبي', 'Negative', '#e63946', 'x-circle', 2, TRUE, 0.50, TRUE),
  ('impediment', 'معوق', 'Impediment', '#f4a261', 'alert-triangle', 3, TRUE, 0.30, TRUE),
  ('obstacle', 'معضلة', 'Obstacle', '#8b5cf6', 'octagon-alert', 4, TRUE, 0.00, TRUE)
ON CONFLICT ("code") DO UPDATE SET
  "name_ar" = EXCLUDED."name_ar",
  "name_en" = EXCLUDED."name_en",
  "color" = EXCLUDED."color",
  "icon" = EXCLUDED."icon",
  "sort_order" = EXCLUDED."sort_order",
  "affects_score" = EXCLUDED."affects_score",
  "score_multiplier" = EXCLUDED."score_multiplier",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = CURRENT_TIMESTAMP;

UPDATE "criteria_options" co
SET "option_type_id" = eot."id"
FROM "evaluation_option_types" eot
WHERE co."option_type_id" IS NULL
  AND eot."code" = CASE
    WHEN co."type" = 'dilemma' THEN 'obstacle'
    ELSE co."type"
  END;
