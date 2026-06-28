-- CreateTable: import_sessions
CREATE TABLE IF NOT EXISTS "import_sessions" (
    "id" UUID NOT NULL,
    "filename" VARCHAR(500) NOT NULL,
    "total_entries" INTEGER DEFAULT 0 NOT NULL,
    "normalized_count" INTEGER DEFAULT 0 NOT NULL,
    "matched_count" INTEGER DEFAULT 0 NOT NULL,
    "unmatched_count" INTEGER DEFAULT 0 NOT NULL,
    "pending_count" INTEGER DEFAULT 0 NOT NULL,
    "linked_count" INTEGER DEFAULT 0 NOT NULL,
    "created_count" INTEGER DEFAULT 0 NOT NULL,
    "skipped_count" INTEGER DEFAULT 0 NOT NULL,
    "status" VARCHAR(20) DEFAULT 'pending' NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "import_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: import_queue_items
CREATE TABLE IF NOT EXISTS "import_queue_items" (
    "id" SERIAL NOT NULL,
    "session_id" UUID NOT NULL,
    "raw_name" VARCHAR(500) NOT NULL,
    "normalized_name" VARCHAR(500) NOT NULL,
    "rank_guess" VARCHAR(100),
    "source_group" VARCHAR(255),
    "source_assignment" VARCHAR(255),
    "notes" TEXT,
    "suggested_inspector_id" UUID,
    "confidence_score" INTEGER,
    "status" VARCHAR(20) DEFAULT 'pending' NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "import_queue_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "import_queue_items" ADD CONSTRAINT "import_queue_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "import_sessions"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "import_queue_items" ADD CONSTRAINT "import_queue_items_suggested_inspector_id_fkey" FOREIGN KEY ("suggested_inspector_id") REFERENCES "inspectors"("id") ON DELETE SET NULL;
