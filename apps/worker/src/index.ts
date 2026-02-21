import Redis from 'ioredis';
import { Worker, Job } from 'bullmq';
import { prisma, Prisma } from '@sense/database';
import { CONTRACT_VERSION, TELEMETRY_V1_SCHEMA_VERSION, TelemetryEventV1 } from '@sense/contracts';
import { evaluateRule, aggregateStatus } from './status/evaluate';
import { evaluateAlarmRule } from './alarms/evaluate';
import { sendNotification } from './notifications';

console.log(`Worker started. Contracts version: ${CONTRACT_VERSION}`);

// --- Health Check Server (Moved to top for debugging/reliability) ---
import * as http from 'http';
const HEALTH_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'worker' }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

if (process.env.WORKER_RUN_ONCE !== '1') {
    server.listen(HEALTH_PORT, '0.0.0.0', () => {
        console.log(`Health server listening on port ${HEALTH_PORT}`);
    });
}

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

async function checkAndConsumeAck(clientId: string, deviceId: string, ruleId: string): Promise<boolean> {
    if (!ruleId) return false;

    // Find unconsumed ack
    const ack = await prisma.notificationOutbox.findFirst({
        where: {
            client_id: clientId,
            device_id: deviceId,
            rule_id: ruleId,
            acknowledged_at: { not: null },
            ack_consumed: false
        },
        orderBy: { acknowledged_at: 'desc' }
    });

    if (ack) {
        // Mark as consumed
        await prisma.notificationOutbox.update({
            where: { id: ack.id },
            data: { ack_consumed: true }
        });
        return true;
    }
    return false;
}

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

                        // Determine Repeat Interval (default 0)
                        const repeatInterval = triggeringRule?.breach_duration_seconds || 0;

                        const now = new Date();
                        const nowTime = now.getTime();

                        // State from previous execution
                        let nextNotifyAt = previousReason?.next_notify_at ? new Date(previousReason.next_notify_at).getTime() : 0;
                        let firstNotifiedAt = previousReason?.first_notified_at;

                        // Check if this is a new Red episode (or we lost state)
                        // If no first_notified_at or no previousReason, it's new.
                        const isNewEpisode = !firstNotifiedAt;

                        if (isNewEpisode) {
                            // First notification for this episode
                            shouldNotify = true;
                            lastNotifiedAt = now.toISOString();

                            // Set schedule for next time
                            // first = now
                            // last = now
                            // next = now + interval
                            firstNotifiedAt = now.toISOString();
                            nextNotifyAt = nowTime + (repeatInterval * 1000);
                        } else {
                            // Existing episode. Check if due.
                            if (nowTime >= nextNotifyAt) {
                                shouldNotify = true;

                                // Check for Snooze (Ack)
                                // Only check if we are considering notifying
                                const snoozed = await checkAndConsumeAck(device.client_id, device.id, ruleId);
                                if (snoozed) {
                                    console.log(`[ACK] Snoozed notification for device=${device.id} rule=${ruleId}`);
                                    shouldNotify = false;
                                }

                                lastNotifiedAt = now.toISOString();

                                // Advance schedule
                                // next = now + interval (Reset drift to now to avoid burst if worker was down)
                                // strict periodicity would use nextNotifyAt + interval
                                // Implementation Plan said: next = now + interval
                                nextNotifyAt = nowTime + (repeatInterval * 1000);
                            } else {
                                // Not due yet
                                shouldNotify = false;
                                lastNotifiedAt = previousReason?.last_notified_at; // Keep old
                            }
                        }

                        // Observability
                        console.log(`[NOTIF_CHECK] device=${device.id} rule=${ruleId} status=RED now=${now.toISOString()} next=${new Date(nextNotifyAt).toISOString()} notify=${shouldNotify}`);

                        if (shouldNotify) {
                            const reason = finalStatus.reason as any;
                            // Update reason with scheduling state
                            reason.last_notified_at = lastNotifiedAt;
                            reason.first_notified_at = firstNotifiedAt;
                            reason.next_notify_at = new Date(nextNotifyAt).toISOString();
                            reason.repeat_interval_seconds = repeatInterval;

                            // Generate Idempotency Key
                            // Use deterministic time-bucket avoids duplicates even if we retry quickly
                            // bucketedTime = floor(now / repeatInterval)
                            const bucketSize = repeatInterval > 0 ? repeatInterval : 1;
                            const bucket = Math.floor(nowTime / 1000 / bucketSize);
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
                            // Update reason to persist scheduling state even if not notifying
                            (finalStatus.reason as any).last_notified_at = lastNotifiedAt;
                            (finalStatus.reason as any).first_notified_at = firstNotifiedAt;
                            (finalStatus.reason as any).next_notify_at = new Date(nextNotifyAt).toISOString();
                            (finalStatus.reason as any).repeat_interval_seconds = repeatInterval;
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

            // 4. Device Alarm Rules Evaluation
            if (device) {
                const alarmRules = await prisma.deviceAlarmRule.findMany({
                    where: { device_id: device.id, enabled: true }
                });

                if (alarmRules.length > 0) {
                    const history = await prisma.telemetryEvent.findMany({
                        where: { device_id: device.id },
                        orderBy: { occurred_at: 'desc' },
                        take: 300
                    });

                    for (const rule of alarmRules) {
                        const evalResult = evaluateAlarmRule(rule, history);

                        if (evalResult.isViolated) {
                            const existingActive = await prisma.notificationOutbox.findFirst({
                                where: { device_id: device.id, rule_id: rule.id, resolved_at: null }
                            });

                            if (!existingActive) {
                                await prisma.notificationOutbox.create({
                                    data: {
                                        client_id: device.client_id,
                                        device_id: device.id,
                                        rule_id: rule.id,
                                        message: `Alarm Triggered: ${rule.metric} ${rule.operator} ${rule.threshold} (Actual: ${evalResult.latestValue})`
                                    }
                                });
                                console.log(`[ALARM] Triggered rule ${rule.id} for device ${device.id}`);
                            }
                        } else {
                            const existingActive = await prisma.notificationOutbox.findFirst({
                                where: { device_id: device.id, rule_id: rule.id, resolved_at: null }
                            });

                            if (existingActive) {
                                await prisma.notificationOutbox.update({
                                    where: { id: existingActive.id },
                                    data: { resolved_at: new Date() }
                                });
                                console.log(`[ALARM] Resolved rule ${rule.id} for device ${device.id}`);
                            }
                        }
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
    concurrency: 1,
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

// Health server moved to top

// --- Graceful Shutdown ---
const shutdown = async (signal: string) => {
    console.log(`[${signal}] Shutting down worker...`);

    // 1. Close Health Server
    server.close(() => {
        console.log('Health server closed');
    });

    // 2. Close Worker (stops accepting new jobs, waits for current to finish)
    await worker.close();
    console.log('Worker closed');

    // 3. Close Redis
    await connection.quit();
    console.log('Redis connection closed');

    // 4. Disconnect Prisma
    await prisma.$disconnect();
    console.log('Prisma disconnected');

    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// WORKER_RUN_ONCE Mode for E2E Tests
if (process.env.WORKER_RUN_ONCE === '1') {
    import('bullmq').then(({ Queue }) => {
        const queue = new Queue(WORKER_QUEUE_NAME, { connection });
        let idleCycles = 0;

        // Give connection and worker time to start
        setTimeout(() => {
            setInterval(async () => {
                const counts = await queue.getJobCounts('wait', 'active', 'delayed', 'completed', 'failed');
                console.log(`[Queue Monitor] wait:${counts.wait} active:${counts.active} delayed:${counts.delayed} completed:${counts.completed} failed:${counts.failed}`);

                if (counts.wait === 0 && counts.active === 0 && counts.delayed === 0) {
                    idleCycles++;
                    if (idleCycles >= 3) {
                        console.log('Queue empty. Exiting WORKER_RUN_ONCE mode.');
                        await shutdown('SIGTERM');
                    }
                } else {
                    idleCycles = 0;
                }
            }, 1000);
        }, 2000);
    });
}
