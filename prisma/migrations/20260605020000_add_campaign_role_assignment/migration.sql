-- Create DutyRole enum
DO $$ BEGIN
  CREATE TYPE "DutyRole" AS ENUM ('LEADER', 'DEPUTY', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add role, assigned_at, assigned_by_id to campaign_members
ALTER TABLE "campaign_members"
  ADD COLUMN IF NOT EXISTS "role" "DutyRole" NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "assigned_by_id" UUID;

-- Create index on role
CREATE INDEX IF NOT EXISTS idx_campaign_members_role ON "campaign_members" ("role");

-- Add foreign key for assigned_by_id
DO $$ BEGIN
  ALTER TABLE "campaign_members"
    ADD CONSTRAINT "fk_campaign_members_assigned_by"
    FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create campaign_group_assignments table
CREATE TABLE IF NOT EXISTS "campaign_group_assignments" (
  "id" SERIAL PRIMARY KEY,
  "campaign_id" UUID NOT NULL,
  "group_id" INTEGER NOT NULL,
  "role" VARCHAR(20),
  "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assigned_by_id" UUID,
  CONSTRAINT "fk_cga_campaign" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_cga_group" FOREIGN KEY ("group_id") REFERENCES "inspection_groups"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_cga_assigned_by" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "uq_cga_campaign_group" UNIQUE ("campaign_id", "group_id")
);

CREATE INDEX IF NOT EXISTS idx_cga_campaign_id ON "campaign_group_assignments" ("campaign_id");
CREATE INDEX IF NOT EXISTS idx_cga_group_id ON "campaign_group_assignments" ("group_id");

-- Backfill CampaignMember role rows from Campaign.leaderId/deputyId
-- Set role=LEADER for the inspector matching leaderId
UPDATE "campaign_members" cm
SET "role" = 'LEADER'
FROM "campaigns" c
WHERE cm."campaign_id" = c."id"
  AND cm."inspector_id" = c."leader_id"
  AND c."leader_id" IS NOT NULL;

-- Set role=DEPUTY for the inspector matching deputyId
UPDATE "campaign_members" cm
SET "role" = 'DEPUTY'
FROM "campaigns" c
WHERE cm."campaign_id" = c."id"
  AND cm."inspector_id" = c."deputy_id"
  AND c."deputy_id" IS NOT NULL;
