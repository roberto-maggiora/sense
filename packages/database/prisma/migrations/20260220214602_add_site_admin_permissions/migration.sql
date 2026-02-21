-- AlterTable
ALTER TABLE "notifications_outbox" ADD COLUMN     "resolved_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "site_id" TEXT;

-- CreateTable
CREATE TABLE "device_alarm_rules" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "operator" "Operator" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "severity" "DeviceStatusLevel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_alarm_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_alarm_rules_client_id_device_id_idx" ON "device_alarm_rules"("client_id", "device_id");

-- CreateIndex
CREATE INDEX "device_alarm_rules_enabled_idx" ON "device_alarm_rules"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "device_alarm_rules_device_id_metric_severity_key" ON "device_alarm_rules"("device_id", "metric", "severity");

-- CreateIndex
CREATE INDEX "users_site_id_idx" ON "users"("site_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_alarm_rules" ADD CONSTRAINT "device_alarm_rules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_alarm_rules" ADD CONSTRAINT "device_alarm_rules_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
