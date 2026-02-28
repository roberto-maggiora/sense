import Redis from 'ioredis';
import { Worker, Job } from 'bullmq';
import { prisma } from '@sense/database';
import { CONTRACT_VERSION, TELEMETRY_V1_SCHEMA_VERSION, TelemetryEventV1 } from '@sense/contracts';
import { updateDeviceStatusForDevice } from './status/updateDeviceStatus';
import { evaluateAndUpdateAlerts } from './alerts/evaluateAndUpdateAlert';
import { startDispatcher, stopDispatcher } from './notifications/dispatcher';

console.log(`Worker started. Contracts version: ${CONTRACT_VERSION}`);

// Start notification outbox dispatcher
startDispatcher();

// --- Health Check Server ---
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

const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
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
        throw new Error(`Invalid schema version: ${event.schema_version}`);
    }

    // 2. Persist telemetry event
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
                payload: event as any
            }
        });
        console.log(`[${WORKER_QUEUE_NAME}] job=${job.id} idempotency_key=${event.idempotency_key} status=persisted`);

        // 3. Update device status (DeviceAlarmRule-based)
        await updateDeviceStatusForDevice(eventRecord.device_id);

        // 4. Alert State Machine — enqueues outbox items inside the same transaction
        try {
            await evaluateAndUpdateAlerts(eventRecord.device_id, event.tenant.client_id);
        } catch (alertErr: unknown) {
            const msg = alertErr instanceof Error ? alertErr.message : String(alertErr);
            console.error(`[ALERT] evaluation_failed device=${eventRecord.device_id} error=${msg}`);
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

// --- Graceful Shutdown ---
const shutdown = async (signal: string) => {
    console.log(`[${signal}] Shutting down worker...`);

    stopDispatcher();

    server.close(() => {
        console.log('Health server closed');
    });

    await worker.close();
    console.log('Worker closed');

    await connection.quit();
    console.log('Redis connection closed');

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
