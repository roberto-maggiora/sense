-- CreateTable
CREATE TABLE "telemetry_events" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_events_idempotency_key_key" ON "telemetry_events"("idempotency_key");

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
