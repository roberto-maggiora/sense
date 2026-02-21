-- CreateTable
CREATE TABLE "notifications_outbox" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,
    "ack_consumed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notifications_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_outbox_client_id_idx" ON "notifications_outbox"("client_id");
