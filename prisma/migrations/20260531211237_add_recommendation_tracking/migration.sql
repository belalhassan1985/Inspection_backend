-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('ISSUED', 'FORWARDED', 'UNDER_PROCESSING', 'PARTIALLY_COMPLETED', 'COMPLETED', 'NEEDS_CLARIFICATION', 'VERIFIED', 'CLOSED', 'REJECTED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ImpactCategory" AS ENUM ('SECURITY', 'ADMINISTRATIVE', 'HUMAN_RESOURCES', 'LOGISTICS', 'INFRASTRUCTURE', 'TRAINING', 'LEGAL', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "RecommendationActionType" AS ENUM ('STATUS_CHANGE', 'COMMENT', 'EVIDENCE_UPLOAD', 'REASSIGN', 'EXTENSION_REQUEST', 'PROGRESS_UPDATE');

-- CreateSequence
CREATE SEQUENCE recommendation_number_seq START WITH 1;

-- AlterTable
ALTER TABLE "campaign_recommendations" ADD COLUMN     "impact_category" "ImpactCategory",
ADD COLUMN     "risk_level" "RiskLevel";

-- CreateTable
CREATE TABLE "recommendation_tracking" (
    "id" UUID NOT NULL,
    "recommendation_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "recommendation_number" VARCHAR(50) NOT NULL DEFAULT 'REC-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('recommendation_number_seq')::text, 6, '0'),
    "assigned_entity_id" UUID,
    "assigned_user_id" UUID,
    "assigned_entity_name_snapshot" VARCHAR(200) NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'ISSUED',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "risk_level" "RiskLevel" NOT NULL,
    "impact_category" "ImpactCategory" NOT NULL,
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" DATE,
    "completion_date" TIMESTAMP(6),
    "closed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "recommendation_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_action_logs" (
    "id" UUID NOT NULL,
    "tracking_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action_type" "RecommendationActionType" NOT NULL,
    "from_status" "RecommendationStatus",
    "to_status" "RecommendationStatus",
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_evidence" (
    "id" UUID NOT NULL,
    "tracking_id" UUID NOT NULL,
    "action_log_id" UUID,
    "uploaded_by_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_tracking_recommendation_id_key" ON "recommendation_tracking"("recommendation_id");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_tracking_recommendation_number_key" ON "recommendation_tracking"("recommendation_number");

-- AddForeignKey
ALTER TABLE "recommendation_tracking" ADD CONSTRAINT "recommendation_tracking_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "campaign_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_tracking" ADD CONSTRAINT "recommendation_tracking_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_tracking" ADD CONSTRAINT "recommendation_tracking_assigned_entity_id_fkey" FOREIGN KEY ("assigned_entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_tracking" ADD CONSTRAINT "recommendation_tracking_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_action_logs" ADD CONSTRAINT "recommendation_action_logs_tracking_id_fkey" FOREIGN KEY ("tracking_id") REFERENCES "recommendation_tracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_action_logs" ADD CONSTRAINT "recommendation_action_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_evidence" ADD CONSTRAINT "recommendation_evidence_tracking_id_fkey" FOREIGN KEY ("tracking_id") REFERENCES "recommendation_tracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_evidence" ADD CONSTRAINT "recommendation_evidence_action_log_id_fkey" FOREIGN KEY ("action_log_id") REFERENCES "recommendation_action_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_evidence" ADD CONSTRAINT "recommendation_evidence_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
