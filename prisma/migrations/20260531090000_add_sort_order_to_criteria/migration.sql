-- DropForeignKey
ALTER TABLE "campaign_members" DROP CONSTRAINT "campaign_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_deputy_id_fkey";

-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_leader_id_fkey";

-- AlterTable
ALTER TABLE "campaign_members" DROP CONSTRAINT "campaign_members_pkey",
DROP COLUMN "user_id",
ADD COLUMN     "inspector_id" UUID NOT NULL,
ADD CONSTRAINT "campaign_members_pkey" PRIMARY KEY ("campaign_id", "inspector_id");

-- AlterTable
ALTER TABLE "criteria_details" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "table_schema" JSONB;

-- AlterTable
ALTER TABLE "criteria_options" ADD COLUMN     "score_value" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "inspection_grades" ADD COLUMN     "instance_name" VARCHAR(200);

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "officer_credentials" JSONB;

-- AlterTable
ALTER TABLE "primary_criteria" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "secondary_criteria" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "inspectors" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "department" VARCHAR(150),
    "phone" VARCHAR(50),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "inspectors_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_deputy_id_fkey" FOREIGN KEY ("deputy_id") REFERENCES "inspectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "inspectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
