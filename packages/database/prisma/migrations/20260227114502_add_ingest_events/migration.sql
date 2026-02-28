-- CreateTable
CREATE TABLE "ingest_events" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "client_id" TEXT,
    "serial" TEXT,
    "device_external_id" TEXT,
    "status" TEXT NOT NULL,
    "http_status" INTEGER,
    "error_message" TEXT,
    "meta_json" JSONB,

    CONSTRAINT "ingest_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingest_events_source_topic_created_at_idx" ON "ingest_events"("source", "topic", "created_at");

-- CreateIndex
CREATE INDEX "ingest_events_client_id_created_at_idx" ON "ingest_events"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "ingest_events_status_created_at_idx" ON "ingest_events"("status", "created_at");
