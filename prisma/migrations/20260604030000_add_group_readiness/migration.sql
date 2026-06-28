-- CreateTable
CREATE TABLE "group_readiness_snapshots" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "snapshot_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readiness_score" DECIMAL(5,2) NOT NULL,
    "readiness_level" VARCHAR(20) NOT NULL,
    "availability_score" DECIMAL(5,2) NOT NULL,
    "workload_score" DECIMAL(5,2) NOT NULL,
    "leader_score" DECIMAL(5,2) NOT NULL,
    "total_members" INTEGER NOT NULL,
    "available_members" INTEGER NOT NULL,
    "overloaded_members" INTEGER NOT NULL,
    "has_leader_assigned" BOOLEAN NOT NULL,
    "leader_is_available" BOOLEAN NOT NULL,

    CONSTRAINT "group_readiness_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_readiness_snapshots_group_id_snapshot_date_key" ON "group_readiness_snapshots"("group_id", "snapshot_date");

-- AddForeignKey
ALTER TABLE "group_readiness_snapshots" ADD CONSTRAINT "group_readiness_snapshots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "inspection_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
