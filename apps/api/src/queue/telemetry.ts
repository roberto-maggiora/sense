import { Queue } from 'bullmq';
import { TelemetryEventV1 } from '@sense/contracts';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null
});

export const TELEMETRY_QUEUE_NAME = 'telemetry_ingest_v1';

export const telemetryQueue = new Queue<TelemetryEventV1>(TELEMETRY_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000
        },
        removeOnComplete: 100,
        removeOnFail: 500
    }
});

export async function enqueueTelemetry(event: TelemetryEventV1) {
    const job = await telemetryQueue.add('telemetry-event', event);
    return job.id;
}
