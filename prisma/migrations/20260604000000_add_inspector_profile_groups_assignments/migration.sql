-- AlterTable: Add profile fields to inspectors
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "rank" VARCHAR(100);
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "title" VARCHAR(100);
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "specialization" VARCHAR(200);
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "photo_url" VARCHAR(500);
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "photo_updated_at" TIMESTAMP(6);
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "email" VARCHAR(150);
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "office" VARCHAR(100);
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "years_of_service" INTEGER;
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "profile_notes" TEXT;
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "primary_group_id" INTEGER;
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "last_field_participation_at" TIMESTAMP(6);
ALTER TABLE "inspectors" ADD COLUMN IF NOT EXISTS "activity_score" DECIMAL(5,2) DEFAULT 0;

-- CreateTable: inspection_groups
CREATE TABLE IF NOT EXISTS "inspection_groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(100),
    "description" TEXT,
    "source_reference" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "inspection_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique group name
CREATE UNIQUE INDEX IF NOT EXISTS "inspection_groups_name_key" ON "inspection_groups"("name");

-- CreateTable: inspector_group_members
CREATE TABLE IF NOT EXISTS "inspector_group_members" (
    "id" SERIAL NOT NULL,
    "inspector_id" UUID NOT NULL,
    "group_id" INTEGER NOT NULL,
    "role_in_group" VARCHAR(100),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspector_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique per inspector per group
CREATE UNIQUE INDEX IF NOT EXISTS "inspector_group_members_inspector_id_group_id_key" ON "inspector_group_members"("inspector_id", "group_id");

-- CreateTable: inspector_assignments
CREATE TABLE IF NOT EXISTS "inspector_assignments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "assignment_type" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "reference_number" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "inspector_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: inspector_assignment_members
CREATE TABLE IF NOT EXISTS "inspector_assignment_members" (
    "id" SERIAL NOT NULL,
    "inspector_id" UUID NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspector_assignment_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique per inspector per assignment
CREATE UNIQUE INDEX IF NOT EXISTS "inspector_assignment_members_inspector_id_assignment_id_key" ON "inspector_assignment_members"("inspector_id", "assignment_id");

-- AddForeignKey: inspectors primary_group_id -> inspection_groups.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inspectors_primary_group_id_fkey') THEN
        ALTER TABLE "inspectors" ADD CONSTRAINT "inspectors_primary_group_id_fkey" FOREIGN KEY ("primary_group_id") REFERENCES "inspection_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: inspector_group_members inspector_id -> inspectors.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inspector_group_members_inspector_id_fkey') THEN
        ALTER TABLE "inspector_group_members" ADD CONSTRAINT "inspector_group_members_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: inspector_group_members group_id -> inspection_groups.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inspector_group_members_group_id_fkey') THEN
        ALTER TABLE "inspector_group_members" ADD CONSTRAINT "inspector_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "inspection_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: inspector_assignment_members inspector_id -> inspectors.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inspector_assignment_members_inspector_id_fkey') THEN
        ALTER TABLE "inspector_assignment_members" ADD CONSTRAINT "inspector_assignment_members_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: inspector_assignment_members assignment_id -> inspector_assignments.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inspector_assignment_members_assignment_id_fkey') THEN
        ALTER TABLE "inspector_assignment_members" ADD CONSTRAINT "inspector_assignment_members_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "inspector_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
