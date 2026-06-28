-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'ON_LEAVE', 'ON_MISSION', 'TRAINING', 'MEDICAL', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "SecurityClassificationLevel" AS ENUM ('RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET');

-- DropForeignKey
ALTER TABLE "import_queue_items" DROP CONSTRAINT "import_queue_items_session_id_fkey";

-- DropForeignKey
ALTER TABLE "import_queue_items" DROP CONSTRAINT "import_queue_items_suggested_inspector_id_fkey";

-- DropForeignKey
ALTER TABLE "inbox_notifications" DROP CONSTRAINT "inbox_notifications_tracking_id_fkey";

-- DropForeignKey
ALTER TABLE "inbox_notifications" DROP CONSTRAINT "inbox_notifications_user_id_fkey";

-- AlterTable
ALTER TABLE "evaluation_option_types" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "inbox_notifications" ALTER COLUMN "metadata" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "inspectors" ADD COLUMN     "availability_changed_by" UUID,
ADD COLUMN     "availability_reason" VARCHAR(255),
ADD COLUMN     "availability_status" "AvailabilityStatus" DEFAULT 'AVAILABLE',
ADD COLUMN     "availability_until" DATE,
ADD COLUMN     "availability_updated_at" TIMESTAMP(6);

-- AlterTable
ALTER TABLE "recommendation_tracking" ADD COLUMN     "parent_tracking_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "security_classification" "SecurityClassificationLevel" NOT NULL DEFAULT 'RESTRICTED';

-- CreateTable
CREATE TABLE "risk_level_options" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name_ar" VARCHAR(100) NOT NULL,
    "color" VARCHAR(30) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "severity_weight" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "risk_level_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_comments" (
    "id" UUID NOT NULL,
    "tracking_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "comment_text" TEXT NOT NULL,
    "parent_comment_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "recommendation_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_kpi_snapshots" (
    "id" UUID NOT NULL,
    "snapshot_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_recommendations" INTEGER NOT NULL,
    "open_recommendations" INTEGER NOT NULL,
    "closed_recommendations" INTEGER NOT NULL,
    "overall_compliance_rate" DECIMAL(5,2) NOT NULL,
    "closure_rate" DECIMAL(5,2) NOT NULL,
    "average_resolution_time_days" DECIMAL(6,2),
    "sla_adherence_rate" DECIMAL(5,2),
    "overdue_count" INTEGER NOT NULL,
    "escalation_level_3_count" INTEGER NOT NULL,
    "critical_count" INTEGER NOT NULL,
    "entity_breakdown" JSONB NOT NULL,

    CONSTRAINT "executive_kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_health_histories" (
    "id" UUID NOT NULL,
    "tracking_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "status_snapshot" "RecommendationStatus" NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_health_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_breach_logs" (
    "id" UUID NOT NULL,
    "tracking_id" UUID NOT NULL,
    "milestone_type" VARCHAR(50) NOT NULL,
    "breach_duration_days" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_breach_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "risk_level_options_code_key" ON "risk_level_options"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sla_breach_logs_tracking_id_milestone_type_key" ON "sla_breach_logs"("tracking_id", "milestone_type");

-- AddForeignKey
ALTER TABLE "recommendation_tracking" ADD CONSTRAINT "recommendation_tracking_parent_tracking_id_fkey" FOREIGN KEY ("parent_tracking_id") REFERENCES "recommendation_tracking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_comments" ADD CONSTRAINT "recommendation_comments_tracking_id_fkey" FOREIGN KEY ("tracking_id") REFERENCES "recommendation_tracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_comments" ADD CONSTRAINT "recommendation_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_comments" ADD CONSTRAINT "recommendation_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "recommendation_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_notifications" ADD CONSTRAINT "inbox_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_health_histories" ADD CONSTRAINT "recommendation_health_histories_tracking_id_fkey" FOREIGN KEY ("tracking_id") REFERENCES "recommendation_tracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_breach_logs" ADD CONSTRAINT "sla_breach_logs_tracking_id_fkey" FOREIGN KEY ("tracking_id") REFERENCES "recommendation_tracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_queue_items" ADD CONSTRAINT "import_queue_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "import_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_queue_items" ADD CONSTRAINT "import_queue_items_suggested_inspector_id_fkey" FOREIGN KEY ("suggested_inspector_id") REFERENCES "inspectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

