import Redis from 'ioredis';
import { Worker, Job } from 'bullmq';
import { prisma } from '@sense/database';
import { CONTRACT_VERSION, TELEMETRY_V1_SCHEMA_VERSION, TelemetryEventV1 } from '@sense/contracts';

console.log(`Worker started. Contracts version: ${CONTRACT_VERSION}`);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Reuse Redis connection for BullMQ
const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null
});

const WORKER_QUEUE_NAME = 'telemetry_ingest_v1';

const worker = new Worker<TelemetryEventV1>(WORKER_QUEUE_NAME, async (job: Job<TelemetryEventV1>) => {
    const event = job.data;
    console.log(`[${WORKER_QUEUE_NAME}] job=${job.id} idempotency_key=${event.idempotency_key} status=started`);

    // 1. Validate Schema Version
    if (event.schema_version !== TELEMETRY_V1_SCHEMA_VERSION) {
        console.error(`[${WORKER_QUEUE_NAME}] job=${job.id} status=rejected_schema_version schema_version=${event.schema_version}`);
        // Optionally throw to retry, or just fail permanently. For now, fail permanently (Unrecoverable).
        throw new Error(`Invalid schema version: ${event.schema_version}`);
    }

    // 2. Insert into DB
    try {
        await prisma.telemetryEvent.create({
            data: {
                client_id: event.tenant.client_id,
                device_id: event.device.id || 'unknown',
                schema_version: event.schema_version,
                source: event.source,
                occurred_at: new Date(event.occurred_at),
                received_at: new Date(event.received_at),
                idempotency_key: event.idempotency_key,
                payload: event as any // Store full JSON
            }
        });
        console.log(`[${WORKER_QUEUE_NAME}] job=${job.id} idempotency_key=${event.idempotency_key} status=persisted`);
    } catch (e: any) {
        if (e.code === 'P2002') {
            console.warn(`[${WORKER_QUEUE_NAME}] job=${job.id} idempotency_key=${event.idempotency_key} status=deduped`);
            return;
        }
        throw e;
    }

}, {
    connection,
    concurrency: 5,
    limiter: {
        max: 1000,
        duration: 1000
    }
});

worker.on('completed', (job) => {
    console.log(`[Job ${job.id}] Completed`);
});

worker.on('failed', (job, err) => {
    console.error(`[Job ${job?.id}] Failed: ${err.message}`);
});

console.log(`Worker listening on queue: ${WORKER_QUEUE_NAME}`);
