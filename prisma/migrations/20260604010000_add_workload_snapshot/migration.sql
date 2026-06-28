-- CreateTable
CREATE TABLE "workload_snapshots" (
    "id" UUID NOT NULL,
    "inspector_id" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "leader_count" INTEGER NOT NULL DEFAULT 0,
    "deputy_count" INTEGER NOT NULL DEFAULT 0,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "leader_weighted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deputy_weighted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "member_weighted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inspection_sum" INTEGER NOT NULL DEFAULT 0,
    "open_rec_sum" INTEGER NOT NULL DEFAULT 0,
    "snapshot_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workload_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workload_snapshots_snapshot_date_idx" ON "workload_snapshots"("snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "workload_snapshots_inspector_id_snapshot_date_key" ON "workload_snapshots"("inspector_id", "snapshot_date");

-- AddForeignKey
ALTER TABLE "workload_snapshots" ADD CONSTRAINT "workload_snapshots_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
