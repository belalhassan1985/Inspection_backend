-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role_id" INTEGER,
    "department" VARCHAR(150),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "parent_id" UUID,
    "level" VARCHAR(20) NOT NULL,
    "is_assistant" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_positions" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "position_name" VARCHAR(150) NOT NULL,
    "position_status" VARCHAR(20) NOT NULL,
    "statistical_number" VARCHAR(50) NOT NULL,
    "position_holder" VARCHAR(150) NOT NULL,
    "joined_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "cadre_status" VARCHAR(100),
    "education" VARCHAR(150),
    "evaluation" VARCHAR(50),
    "notes" TEXT,
    "rank" VARCHAR(50),
    "years_of_service" INTEGER,

    CONSTRAINT "entity_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "primary_criteria" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "max_grade" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "primary_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secondary_criteria" (
    "id" SERIAL NOT NULL,
    "primary_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "max_grade" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "secondary_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria_details" (
    "id" SERIAL NOT NULL,
    "secondary_id" INTEGER NOT NULL,
    "detail_text" TEXT NOT NULL,
    "max_grade" DECIMAL(5,2) NOT NULL,
    "input_type" VARCHAR(20) NOT NULL DEFAULT 'single',

    CONSTRAINT "criteria_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "criteria_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria_template_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "primary_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "criteria_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "assignment_text" TEXT NOT NULL,
    "assignment_reference" VARCHAR(100) NOT NULL,
    "assignment_date" DATE NOT NULL,
    "leader_id" UUID,
    "deputy_id" UUID,
    "purpose" TEXT,
    "entity_id" UUID,
    "formation_number" VARCHAR(100),
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "template_id" UUID,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_members" (
    "campaign_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "campaign_members_pkey" PRIMARY KEY ("campaign_id","user_id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "inspector_id" UUID,
    "entity_id" UUID NOT NULL,
    "location" VARCHAR(255),
    "findings" TEXT,
    "total_score" DECIMAL(5,2),
    "performance_rating" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pendingReview',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_grades" (
    "id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "detail_id" INTEGER NOT NULL,
    "grade_earned" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantitative_data" JSONB,

    CONSTRAINT "inspection_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria_options" (
    "id" SERIAL NOT NULL,
    "detail_id" INTEGER NOT NULL,
    "option_text" TEXT NOT NULL,
    "type" VARCHAR(20) NOT NULL,

    CONSTRAINT "criteria_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_selected_options" (
    "id" UUID NOT NULL,
    "inspection_grade_id" UUID NOT NULL,
    "option_id" INTEGER NOT NULL,

    CONSTRAINT "inspection_selected_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_notes" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "text" TEXT NOT NULL,
    "parent_note_id" UUID,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "campaign_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recommendations" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "authority_name" VARCHAR(150) NOT NULL,
    "recommendation_text" TEXT NOT NULL,
    "parent_rec_id" UUID,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "campaign_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_appendices" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "symbol" VARCHAR(5) NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "campaign_appendices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "action_type" VARCHAR(100) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,

    CONSTRAINT "system_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_presentations" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "history" JSONB,

    CONSTRAINT "report_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RolePermissions" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_RolePermissions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_action_key" ON "permissions"("action");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "criteria_template_items_template_id_primary_id_key" ON "criteria_template_items"("template_id", "primary_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_selected_options_inspection_grade_id_option_id_key" ON "inspection_selected_options"("inspection_grade_id", "option_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_types_name_key" ON "campaign_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_types_key_key" ON "campaign_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "report_presentations_campaign_id_key" ON "report_presentations"("campaign_id");

-- CreateIndex
CREATE INDEX "_RolePermissions_B_index" ON "_RolePermissions"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_positions" ADD CONSTRAINT "entity_positions_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secondary_criteria" ADD CONSTRAINT "secondary_criteria_primary_id_fkey" FOREIGN KEY ("primary_id") REFERENCES "primary_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria_details" ADD CONSTRAINT "criteria_details_secondary_id_fkey" FOREIGN KEY ("secondary_id") REFERENCES "secondary_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria_template_items" ADD CONSTRAINT "criteria_template_items_primary_id_fkey" FOREIGN KEY ("primary_id") REFERENCES "primary_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria_template_items" ADD CONSTRAINT "criteria_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "criteria_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_deputy_id_fkey" FOREIGN KEY ("deputy_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "criteria_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_grades" ADD CONSTRAINT "inspection_grades_detail_id_fkey" FOREIGN KEY ("detail_id") REFERENCES "criteria_details"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_grades" ADD CONSTRAINT "inspection_grades_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria_options" ADD CONSTRAINT "criteria_options_detail_id_fkey" FOREIGN KEY ("detail_id") REFERENCES "criteria_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_selected_options" ADD CONSTRAINT "inspection_selected_options_inspection_grade_id_fkey" FOREIGN KEY ("inspection_grade_id") REFERENCES "inspection_grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_selected_options" ADD CONSTRAINT "inspection_selected_options_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "criteria_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_notes" ADD CONSTRAINT "campaign_notes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_notes" ADD CONSTRAINT "campaign_notes_parent_note_id_fkey" FOREIGN KEY ("parent_note_id") REFERENCES "campaign_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recommendations" ADD CONSTRAINT "campaign_recommendations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recommendations" ADD CONSTRAINT "campaign_recommendations_parent_rec_id_fkey" FOREIGN KEY ("parent_rec_id") REFERENCES "campaign_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_appendices" ADD CONSTRAINT "campaign_appendices_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_presentations" ADD CONSTRAINT "report_presentations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RolePermissions" ADD CONSTRAINT "_RolePermissions_A_fkey" FOREIGN KEY ("A") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RolePermissions" ADD CONSTRAINT "_RolePermissions_B_fkey" FOREIGN KEY ("B") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

