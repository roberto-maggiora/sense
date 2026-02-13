import Redis from 'ioredis';
import { Worker, Job } from 'bullmq';
import { prisma, Prisma } from '@sense/database';
import { CONTRACT_VERSION, TELEMETRY_V1_SCHEMA_VERSION, TelemetryEventV1 } from '@sense/contracts';
import { evaluateRule, aggregateStatus } from './status/evaluate';

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
        const eventRecord = await prisma.telemetryEvent.create({
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

        // 3. Status Engine Evaluation
        try {
            const device = await prisma.device.findUnique({
                where: { id: eventRecord.device_id }
            });

            if (device) {
                // Fetch enabled rules for this device
                const rules = await prisma.alertRule.findMany({
                    where: {
                        client_id: device.client_id,
                        enabled: true,
                        OR: [
                            { scope_type: 'device', scope_id: device.id },
                            { scope_type: 'site', scope_id: device.site_id || '' },
                            { scope_type: 'area', scope_id: device.area_id || '' }
                        ]
                    }
                });

                if (rules.length > 0) {
                    // Fetch recent history without time filtering to accommodate future-dated points
                    // Using take: 300 is robust for typical evaluation windows
                    const history = await prisma.telemetryEvent.findMany({
                        where: {
                            device_id: device.id,
                        },
                        orderBy: { occurred_at: 'desc' },
                        take: 300
                    });

                    const evaluationResults = rules.map(rule => evaluateRule(rule, history));
                    const finalStatus = aggregateStatus(evaluationResults);

                    await prisma.deviceStatus.upsert({
                        where: {
                            device_id: device.id
                        },
                        update: {
                            status: finalStatus.level,
                            reason: finalStatus.reason ? finalStatus.reason : Prisma.DbNull,
                            updated_at: new Date()
                        },
                        create: {
                            client_id: device.client_id,
                            device_id: device.id,
                            status: finalStatus.level,
                            reason: finalStatus.reason ? finalStatus.reason : Prisma.DbNull
                        }
                    });

                    console.log(`[${WORKER_QUEUE_NAME}] device=${device.id} status_updated=${finalStatus.level}`);
                }
            }
        } catch (err: any) {
            console.error(`[${WORKER_QUEUE_NAME}] status_eval_error: ${err.message}`);
        }
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
