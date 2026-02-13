-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('device', 'area', 'site');

-- CreateEnum
CREATE TYPE "Operator" AS ENUM ('gt', 'gte', 'lt', 'lte');

-- CreateEnum
CREATE TYPE "DeviceStatusLevel" AS ENUM ('green', 'amber', 'red');

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "scope_type" "ScopeType" NOT NULL,
    "scope_id" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "operator" "Operator" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "breach_duration_seconds" INTEGER NOT NULL,
    "expected_sample_seconds" INTEGER NOT NULL DEFAULT 300,
    "max_gap_seconds" INTEGER NOT NULL DEFAULT 900,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "recipients" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_status" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "status" "DeviceStatusLevel" NOT NULL,
    "reason" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rules_client_id_idx" ON "alert_rules"("client_id");

-- CreateIndex
CREATE INDEX "alert_rules_client_id_scope_type_scope_id_idx" ON "alert_rules"("client_id", "scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_status_device_id_key" ON "device_status"("device_id");

-- CreateIndex
CREATE INDEX "device_status_client_id_status_idx" ON "device_status"("client_id", "status");

-- CreateIndex
CREATE INDEX "telemetry_events_device_id_occurred_at_idx" ON "telemetry_events"("device_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_status" ADD CONSTRAINT "device_status_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_status" ADD CONSTRAINT "device_status_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
