import Redis from 'ioredis';
import { Worker, Job } from 'bullmq';
import { prisma, Prisma } from '@sense/database';
import { CONTRACT_VERSION, TELEMETRY_V1_SCHEMA_VERSION, TelemetryEventV1 } from '@sense/contracts';
import { evaluateRule, aggregateStatus } from './status/evaluate';
import { sendNotification } from './notifications';

console.log(`Worker started. Contracts version: ${CONTRACT_VERSION}`);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Reuse Redis connection for BullMQ
const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
    // process.exit(1); // Optional, but usually good to exit
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
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

                    // Fetch previous status to detect transition
                    const previousStatus = await prisma.deviceStatus.findUnique({
                        where: { device_id: device.id }
                    });

                    // NOTIFICATION LOGIC: Red Transition & Repeating
                    // 1. Determine if we should notify
                    let shouldNotify = false;
                    let lastNotifiedAt: string | null = null;

                    // Retrieve previous reason to get last_notified_at
                    const previousReason = previousStatus?.reason as any;

                    if (finalStatus.level === 'red') {
                        // Find the triggering rule to get breach_duration_seconds
                        // (Simplified: assuming single rule triggers or taking the first one that matches)
                        // In reality, aggregateStatus might hide which rule caused it if multiple.
                        // But here we mapped rules. We should probably find the rule that caused RED.
                        // For now, let's use the rule from the reason.
                        const ruleId = (finalStatus.reason as any)?.ruleId;
                        const triggeringRule = rules.find(r => r.id === ruleId);

                        // Default to 0 if not found (spammy, but safe) -> actually user said "X = breach_duration_seconds"
                        const repeatInterval = triggeringRule?.breach_duration_seconds || 0;

                        const now = new Date();
                        const lastNotifiedStr = previousReason?.last_notified_at;

                        if (!lastNotifiedStr) {
                            // First time RED (or missing history)
                            shouldNotify = true;
                        } else {
                            const lastNotifiedTime = new Date(lastNotifiedStr).getTime();
                            const elapsedSec = (now.getTime() - lastNotifiedTime) / 1000;

                            if (elapsedSec >= repeatInterval) {
                                shouldNotify = true;
                            } else {
                                // Keep the old timestamp so we don't reset the timer
                                lastNotifiedAt = lastNotifiedStr;
                            }
                        }

                        if (shouldNotify) {
                            lastNotifiedAt = now.toISOString();

                            const reason = finalStatus.reason as any;
                            // Add last_notified_at to payload/reason
                            reason.last_notified_at = lastNotifiedAt;

                            // Generate Idempotency Key
                            // includes (device_id, rule_id, bucketedTime)
                            // bucketedTime = floor(now / repeatInterval)
                            const bucketSize = repeatInterval > 0 ? repeatInterval : 1; // avoid div by 0
                            const bucket = Math.floor(now.getTime() / 1000 / bucketSize);
                            const idempotencyKey = `${device.id}:${ruleId}:${bucket}`;

                            await sendNotification({
                                client_id: device.client_id,
                                device_id: device.id,
                                device_name: device.name,
                                rule_summary: reason,
                                since: reason?.since || new Date().toISOString(),
                                value: reason?.value ?? 'N/A',
                                duration_seconds: reason?.duration ?? 0
                            }, idempotencyKey);
                        } else {
                            // Update reason with old timestamp to persist it
                            (finalStatus.reason as any).last_notified_at = lastNotifiedAt;
                        }
                    } else {
                        // Not RED: clear last_notified_at (implicit by not adding it to new reason)
                        // finalStatus.reason is likely null or has other data. 
                        // If we are Green, reason is null. If Amber, it might have data.
                        // We just ensure we don't copy over last_notified_at from previous if we are not notifying.
                    }

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
                    if (finalStatus.level === 'red') {
                        console.log(`[WORKER] RED status. Notify? ${shouldNotify}. Last: ${lastNotifiedAt}`);
                    }
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
