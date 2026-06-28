-- CreateEnum
CREATE TYPE "ProficiencyLevel" AS ENUM ('BASIC', 'PRACTITIONER', 'ADVANCED', 'EXPERT');

-- CreateTable
CREATE TABLE "specialization_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "specialization_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specializations" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspector_specializations" (
    "id" SERIAL NOT NULL,
    "inspector_id" UUID NOT NULL,
    "specialization_id" INTEGER NOT NULL,
    "proficiency_level" "ProficiencyLevel" NOT NULL DEFAULT 'BASIC',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspector_specializations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inspector_specializations_inspector_id_specialization_id_key" ON "inspector_specializations"("inspector_id", "specialization_id");

-- AddForeignKey
ALTER TABLE "specializations" ADD CONSTRAINT "specializations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "specialization_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_specializations" ADD CONSTRAINT "inspector_specializations_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_specializations" ADD CONSTRAINT "inspector_specializations_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "specializations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspector_specializations" ADD CONSTRAINT "inspector_specializations_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
